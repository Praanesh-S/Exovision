"""
Exovision — Inference Service
=============================
Singleton service that loads the trained model once at application startup
and provides inference + saliency computation to the API routers.

Also loads the KOI catalog CSV into a pandas DataFrame for fast lookups.
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Tuple

import numpy as np
import pandas as pd
import torch

from app.core.config import settings
from app.ml.model import AstroNet1D
from app.ml.explain import compute_saliency

logger = logging.getLogger(__name__)

# Label mappings (must match train.py)
IDX_TO_LABEL = {0: "CONFIRMED", 1: "CANDIDATE", 2: "FALSE POSITIVE"}


class InferenceService:
    """
    Manages model loading, inference, and catalog access.
    Instantiated once in main.py lifespan and shared via app.state.
    """

    def __init__(self):
        self.model: Optional[AstroNet1D] = None
        self.catalog: Optional[pd.DataFrame] = None
        self.device = torch.device("cpu")  # Use CPU for inference (reliable, fast enough)
        self._model_loaded = False

    def load_model(self) -> bool:
        """Load the trained CNN checkpoint. Returns True if successful."""
        model_path = settings.model_dir / settings.model_filename
        
        if not model_path.exists():
            logger.warning(f"Model checkpoint not found at {model_path}. Inference will be unavailable.")
            return False
        
        try:
            self.model = AstroNet1D()
            state_dict = torch.load(model_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
            self.model.to(self.device)
            self.model.eval()
            self._model_loaded = True
            logger.info(f"Model loaded successfully from {model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False

    def load_catalog(self) -> bool:
        """Load the KOI cumulative catalog CSV into memory."""
        catalog_path = settings.data_catalog_dir / "koi_cumulative.csv"
        
        if not catalog_path.exists():
            logger.warning(f"Catalog CSV not found at {catalog_path}")
            return False
        
        try:
            self.catalog = pd.read_csv(catalog_path, comment="#")
            logger.info(f"Catalog loaded: {len(self.catalog)} KOI entries")
            return True
        except Exception as e:
            logger.error(f"Failed to load catalog: {e}")
            return False

    @property
    def is_ready(self) -> bool:
        return self._model_loaded and self.catalog is not None

    def get_koi_row(self, koi_name: str) -> Optional[pd.Series]:
        """
        Look up a single KOI entry by name (e.g. 'K00001.01').
        Handles both 'K00001.01' and 'K00001' formats.
        """
        if self.catalog is None:
            return None
        
        matches = self.catalog[self.catalog["kepoi_name"] == koi_name]
        if len(matches) == 0:
            return None
        return matches.iloc[0]

    def get_star_kois(self, koi_prefix: str) -> pd.DataFrame:
        """
        Get all KOI entries for a given star prefix (e.g. 'K00001' returns K00001.01, K00001.02, etc.)
        """
        if self.catalog is None:
            return pd.DataFrame()
        
        mask = self.catalog["kepoi_name"].str.startswith(koi_prefix + ".")
        return self.catalog[mask]

    def get_processed_path(self, koi_name: str) -> Optional[Path]:
        """
        Check if we have a preprocessed NPZ for this KOI.
        Handles both naming conventions:
          - K00001.01.npz (full KOI name)
          - K00001.npz (star-level name, used by our downloader)
        """
        # Try exact match first
        path = settings.data_processed_dir / f"{koi_name}.npz"
        if path.exists():
            return path
        
        # Try star-level name (strip the .01 suffix)
        star_id = koi_name.split(".")[0]
        path = settings.data_processed_dir / f"{star_id}.npz"
        if path.exists():
            return path
        
        return None

    def classify(self, koi_name: str, download_if_missing: bool = True) -> Optional[Dict]:
        """
        Run full inference pipeline for a given KOI:
          1. Load preprocessed views from cache (or download & preprocess dynamically from MAST if not cached)
          2. Run forward pass through the model
          3. Compute gradient saliency
          
        Returns dict with classification, scores, views, and saliency.
        """
        if not self._model_loaded:
            return None
        
        processed_path = self.get_processed_path(koi_name)
        if processed_path is None:
            if not download_if_missing:
                return None
            # Try to fetch and preprocess dynamically!
            logger.info(f"KOI {koi_name} not found in preprocessed cache. Attempting on-the-fly download and preprocess...")
            row = self.get_koi_row(koi_name)
            if row is None:
                logger.warning(f"KOI {koi_name} not found in cumulative catalog. Cannot preprocess.")
                return None
            
            try:
                # Load parameters from catalog row
                period = float(row["koi_period"])
                epoch_t0 = float(row["koi_time0bk"])
                duration = float(row["koi_duration"]) if not pd.isna(row["koi_duration"]) else 3.0
                disposition = str(row["koi_disposition"])
                
                # Fetch lightcurve dynamically via lightkurve
                import lightkurve as lk
                star_id = koi_name.split(".")[0]
                koi_number = int(star_id[1:])
                search_name = f"KOI-{koi_number}"
                
                logger.info(f"Searching MAST for {search_name}...")
                search_result = lk.search_lightcurve(
                    search_name,
                    mission="Kepler",
                    cadence="long",
                    author="Kepler",
                )
                if len(search_result) == 0:
                    logger.warning(f"No light curves found in MAST for {search_name}")
                    return None
                    
                # For short-period planets (< 50 days), limit to 6 quarters for speed.
                # For long-period planets (>= 50 days), download all quarters to get enough transits for a clean fold.
                if period < 50.0 and len(search_result) > 6:
                    search_result = search_result[:6]
                
                logger.info(f"Downloading light curves for {search_name}...")
                lc_collection = search_result.download_all(quality_bitmask="default")
                stitched_lc = lc_collection.stitch()
                
                t_val = stitched_lc.time.value
                f_val = stitched_lc.flux.value
                
                time_arr = np.asarray(t_val.filled(np.nan) if hasattr(t_val, "filled") else t_val).astype(np.float64)
                flux_arr = np.asarray(f_val.filled(np.nan) if hasattr(f_val, "filled") else f_val).astype(np.float64)
                
                # Clean NaNs
                valid = np.isfinite(time_arr) & np.isfinite(flux_arr)
                time_arr = time_arr[valid]
                flux_arr = flux_arr[valid]
                
                if len(time_arr) == 0:
                    logger.warning(f"No valid data points after cleaning for {search_name}")
                    return None
                
                # Preprocess on-the-fly
                from app.ml.preprocess import TransitPreprocessor
                preprocessor = TransitPreprocessor(global_bins=1000, local_bins=200)
                global_view, local_view = preprocessor.generate_views(
                    time_arr,
                    flux_arr,
                    period=period,
                    epoch_t0=epoch_t0,
                    duration_hours=duration
                )
                
                # Cache the processed views to disk
                settings.data_processed_dir.mkdir(parents=True, exist_ok=True)
                cache_path = settings.data_processed_dir / f"{star_id}.npz"
                np.savez_compressed(
                    cache_path,
                    global_view=global_view,
                    local_view=local_view,
                    label=disposition,
                    period=period,
                    epoch_t0=epoch_t0
                )
                logger.info(f"Successfully processed and cached {koi_name} to {cache_path}")
                
            except Exception as e:
                logger.error(f"Failed to dynamically download and preprocess {koi_name}: {e}")
                return None
        else:
            # Load preprocessed views
            data = np.load(processed_path, allow_pickle=True)
            global_view = data["global_view"].astype(np.float32)
            local_view = data["local_view"].astype(np.float32)
        
        # Run inference
        with torch.no_grad():
            g_tensor = torch.tensor(global_view, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(self.device)
            l_tensor = torch.tensor(local_view, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(self.device)
            logits = self.model(g_tensor, l_tensor)
            probs = torch.softmax(logits, dim=1).squeeze().cpu().numpy()
        
        predicted_idx = int(np.argmax(probs))
        classification = IDX_TO_LABEL[predicted_idx]
        confidence = float(probs[predicted_idx])
        
        # Compute saliency (needs gradients enabled)
        global_saliency, local_saliency, _ = compute_saliency(
            self.model, global_view, local_view
        )
        
        return {
            "classification": classification,
            "confidence": confidence,
            "scores": {
                "confirmed": float(probs[0]),
                "candidate": float(probs[1]),
                "false_positive": float(probs[2]),
            },
            "global_view": global_view.tolist(),
            "local_view": local_view.tolist(),
            "saliency_global": global_saliency.tolist(),
            "saliency_local": local_saliency.tolist(),
        }


# Singleton instance
inference_service = InferenceService()
