"""
Exovision — Dataset Preprocessing Executor
==========================================
Iterates over all downloaded raw light curve files in data/raw/, preprocesses
them into global (1000 bins) and local (200 bins) views using the TransitPreprocessor,
and saves the resulting array pairs to data/processed/.

Also generates diagnostic validation plots for a small sample of stars to visually
verify the pipeline is working correctly.

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.preprocess_dataset
"""

import sys
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from tqdm import tqdm

from app.ml.preprocess import TransitPreprocessor
from app.core.config import settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Make sure we use the correct settings path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
PLOT_DIR = PROCESSED_DIR / "plots"


def generate_diagnostic_plot(
    star_id: str, 
    time: np.ndarray, 
    flux: np.ndarray, 
    flat_flux: np.ndarray,
    phases: np.ndarray, 
    global_view: np.ndarray, 
    local_view: np.ndarray,
    disposition: str
):
    """
    Save a diagnostic PNG panel showing the progress of preprocessing for this star.
    """
    PLOT_DIR.mkdir(parents=True, exist_ok=True)
    
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    fig.suptitle(f"Preprocessing Diagnostics: {star_id} ({disposition})", fontsize=14, fontweight='bold')
    
    # 1. Raw Time Series
    axes[0, 0].plot(time, flux, '.', color='gray', alpha=0.5, markersize=2)
    axes[0, 0].set_title("1. Raw Time Series (PDCSAP Flux)")
    axes[0, 0].set_ylabel("Flux")
    axes[0, 0].set_xlabel("Time (BJD)")
    
    # 2. Detrended/Flattened Time Series
    axes[0, 1].plot(time, flat_flux, '.', color='indigo', alpha=0.3, markersize=2)
    axes[0, 1].set_title("2. Detrended & Flattened Flux")
    axes[0, 1].set_ylabel("Normalized Flux")
    axes[0, 1].set_xlabel("Time (BJD)")
    axes[0, 1].axhline(1.0, color='red', linestyle='--', alpha=0.8)
    
    # 3. Binned Global View
    axes[1, 0].plot(np.linspace(-0.5, 0.5, len(global_view)), global_view, color='royalblue', linewidth=1.5)
    axes[1, 0].set_title(f"3. Binned Global View ({len(global_view)} bins)")
    axes[1, 0].set_ylabel("Standardized Flux")
    axes[1, 0].set_xlabel("Orbital Phase")
    axes[1, 0].grid(True, alpha=0.3)
    
    # 4. Binned Local View
    axes[1, 1].plot(np.linspace(-1, 1, len(local_view)), local_view, 'o-', color='crimson', markersize=3)
    axes[1, 1].set_title(f"4. Binned Local View ({len(local_view)} bins)")
    axes[1, 1].set_ylabel("Normalized Dip Depth")
    axes[1, 1].set_xlabel("Relative Phase (Transit Zoom)")
    axes[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(PLOT_DIR / f"{star_id}_preprocess.png", dpi=150)
    plt.close()


def main():
    logger.info("Starting Exovision preprocessing executor...")
    
    # Ensure directories exist
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Check if catalog exists
    catalog_path = PROJECT_ROOT / "data" / "catalog" / "koi_cumulative.csv"
    if not catalog_path.exists():
        logger.error(f"KOI catalog not found at: {catalog_path}")
        sys.exit(1)
        
    df = pd.read_csv(catalog_path, comment="#")
    # Clean column names and map to star_id
    df["star_id"] = df["kepoi_name"].str.split(".").str[0]
    
    # Build lookup dictionary for parameters needed by folding
    # One star can have multiple planets, we group by star_id and take properties
    # of the first candidate (or the main transit parameter).
    star_params = {}
    for _, row in df.iterrows():
        star_id = row["star_id"]
        # Skip if duplicate or missing values
        if star_id in star_params or pd.isna(row["koi_period"]) or pd.isna(row["koi_time0bk"]):
            continue
        
        star_params[star_id] = {
            "period": float(row["koi_period"]),
            "epoch_t0": float(row["koi_time0bk"]),
            "duration": float(row["koi_duration"]) if not pd.isna(row["koi_duration"]) else 3.0,
            "disposition": str(row["koi_disposition"]),
        }
        
    # Find all downloaded raw npz files
    raw_files = list(RAW_DIR.glob("*.npz"))
    logger.info(f"Found {len(raw_files)} raw light curve files downloaded on disk.")
    
    if not raw_files:
        logger.warning("No raw files found. Run download_lightcurves first.")
        sys.exit(1)
        
    preprocessor = TransitPreprocessor(global_bins=1000, local_bins=200)
    
    success_count = 0
    skipped_count = 0
    plots_generated = 0
    MAX_PLOTS = 8  # Limit diagnostic plots to avoid slow runtime
    
    logger.info(f"Processing dataset and saving to: {PROCESSED_DIR}")
    logger.info("=" * 60)
    
    for raw_file in tqdm(raw_files, desc="Preprocessing"):
        star_id = raw_file.stem
        
        # Verify if we have parameters in catalog for this star
        if star_id not in star_params:
            logger.debug(f"Skipping {star_id} — not in catalog list")
            skipped_count += 1
            continue
            
        params = star_params[star_id]
        
        try:
            # Load raw time and flux arrays
            data = np.load(raw_file)
            time_arr = data["time"]
            flux_arr = data["flux"]
            
            # Generate the views
            global_view, local_view = preprocessor.generate_views(
                time_arr, 
                flux_arr, 
                period=params["period"], 
                epoch_t0=params["epoch_t0"], 
                duration_hours=params["duration"]
            )
            
            # Save processed views to npz
            out_path = PROCESSED_DIR / f"{star_id}.npz"
            np.savez_compressed(
                out_path,
                global_view=global_view,
                local_view=local_view,
                label=params["disposition"],
                period=params["period"],
                epoch_t0=params["epoch_t0"]
            )
            
            # Generate diagnostic plot for visual sanity checking
            # (only do this for the first few files to save time)
            if plots_generated < MAX_PLOTS:
                # Run steps individually to get intermediate flat_flux for plotting
                t_clean, f_clean = preprocessor.clean_outliers(time_arr, flux_arr)
                flat_flux = preprocessor.detrend_light_curve(t_clean, f_clean)
                phases = preprocessor.phase_fold(t_clean, params["period"], params["epoch_t0"])
                
                generate_diagnostic_plot(
                    star_id=star_id,
                    time=t_clean,
                    flux=f_clean,
                    flat_flux=flat_flux,
                    phases=phases,
                    global_view=global_view,
                    local_view=local_view,
                    disposition=params["disposition"]
                )
                plots_generated += 1
                logger.info(f"Generated diagnostic plot for {star_id}")
                
            success_count += 1
            
        except Exception as e:
            logger.error(f"Failed to process {star_id}: {e}")
            
    logger.info("=" * 60)
    logger.info("Preprocessing complete!")
    logger.info(f"  Successfully processed: {success_count} / {len(raw_files)}")
    logger.info(f"  Skipped (no catalog entry): {skipped_count}")
    logger.info(f"  Diagnostic plots saved to: {PLOT_DIR}")


if __name__ == "__main__":
    main()
