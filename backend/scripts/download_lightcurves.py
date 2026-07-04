"""
Exovision — Parallel & Balanced Light Curve Downloader
======================================================
Downloads Kepler long-cadence light curves in parallel (using 3 concurrent workers)
for a balanced subset of stars from the KOI catalog.

Priority is given to building a balanced training set:
  - 500 CONFIRMED planets
  - 500 FALSE POSITIVES
  - 200 CANDIDATES
  Total: 1,200 unique stars (subtracted by any stars already downloaded).

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.download_lightcurves
"""

import os
os.environ["ASTROPY_USE_MEMMAP"] = "False"

# Monkeypatch astropy console to completely disable progress bars/spinners for multi-threaded safety
import astropy.utils.console as au_console
au_console.color_print = lambda *args, **kwargs: None

class DummyProgressBar:
    def __init__(self, *args, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def update(self, *args, **kwargs): pass

au_console.ProgressBar = DummyProgressBar
au_console.ProgressBarOrSpinner = DummyProgressBar
au_console.Spinner = DummyProgressBar

import astropy.io.fits as fits
try:
    fits.Conf.use_memmap.set(False)
except Exception:
    pass

import astropy.utils.data
try:
    astropy.utils.data.conf.show_progress = False
except Exception:
    pass

import astroquery
try:
    astroquery.conf.show_progress = False
except Exception:
    pass
try:
    astroquery.query.conf.show_progress = False
except Exception:
    pass

from astroquery import log as astroquery_log
astroquery_log.setLevel("WARNING")

import astropy
try:
    astropy.log.setLevel("WARNING")
except Exception:
    pass

import sys
import time
import logging
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Tuple

import numpy as np
import pandas as pd
import lightkurve as lk
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "data" / "catalog" / "koi_cumulative.csv"
OUTPUT_DIR = PROJECT_ROOT / "data" / "raw"

# Rate limiting and threads
MAX_WORKERS = 10             # Increased for faster parallel collection
MIN_REQUEST_INTERVAL = 0.2   # Reduced sleep for faster thread launching

# Retry configuration
MAX_RETRIES = 5
RETRY_WAIT_MIN = 4
RETRY_WAIT_MAX = 60

# Balanced sampling size
SAMPLE_CONFIRMED = 1500
SAMPLE_FALSE_POSITIVE = 1500
SAMPLE_CANDIDATE = 500

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(threadName)s) %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Suppress lightkurve's noisy info logs about quality bitmasks
import warnings
from astropy.utils.exceptions import AstropyWarning
warnings.simplefilter('ignore', category=AstropyWarning)
logging.getLogger("lightkurve").setLevel(logging.WARNING)


# ---------------------------------------------------------------------------
# Helper: extract a balanced set of unique stars
# ---------------------------------------------------------------------------

# Global lookup mapping star_id -> kepid (Kepler Input Catalog ID)
STAR_TO_KEPID = {}

def load_balanced_star_ids(catalog_path: Path) -> list[str]:
    """
    Load the catalog and sample a balanced set of unique stars to download:
      - 500 CONFIRMED
      - 500 FALSE POSITIVE
      - 200 CANDIDATE
    Also populates the global STAR_TO_KEPID dictionary.
    """
    global STAR_TO_KEPID
    logger.info(f"Loading KOI catalog from: {catalog_path}")
    df = pd.read_csv(catalog_path, comment="#")

    # Map disposition labels to simplify grouping
    df["star_id"] = df["kepoi_name"].str.split(".").str[0]
    
    # Populate the star_id -> kepid map
    for _, row in df.dropna(subset=["star_id", "kepid"]).iterrows():
        STAR_TO_KEPID[str(row["star_id"])] = int(row["kepid"])
        
    # Drop rows where critical metadata is missing
    df = df.dropna(subset=["koi_disposition", "koi_period", "koi_time0bk"])

    # Separate candidates by class
    confirmed_df = df[df["koi_disposition"] == "CONFIRMED"]
    fp_df = df[df["koi_disposition"] == "FALSE POSITIVE"]
    candidate_df = df[df["koi_disposition"] == "CANDIDATE"]

    # Sample unique star IDs for each class
    # Use random state 42 for reproducibility
    np.random.seed(42)
    
    unique_confirmed = confirmed_df["star_id"].unique()
    unique_fp = fp_df["star_id"].unique()
    unique_candidate = candidate_df["star_id"].unique()

    sampled_confirmed = np.random.choice(
        unique_confirmed, 
        size=min(SAMPLE_CONFIRMED, len(unique_confirmed)), 
        replace=False
    )
    sampled_fp = np.random.choice(
        unique_fp, 
        size=min(SAMPLE_FALSE_POSITIVE, len(unique_fp)), 
        replace=False
    )
    sampled_candidate = np.random.choice(
        unique_candidate, 
        size=min(SAMPLE_CANDIDATE, len(unique_candidate)), 
        replace=False
    )

    all_sampled = np.concatenate([sampled_confirmed, sampled_fp, sampled_candidate])
    # Deduplicate in case a multi-planet system has different dispositions for different planets
    all_sampled = sorted(list(set(all_sampled)))

    logger.info(
        f"Selected balanced subset of {len(all_sampled)} unique stars:\n"
        f"  - Confirmed target limit: {SAMPLE_CONFIRMED} (sampled {len(sampled_confirmed)})\n"
        f"  - False Positive target limit: {SAMPLE_FALSE_POSITIVE} (sampled {len(sampled_fp)})\n"
        f"  - Candidate target limit: {SAMPLE_CANDIDATE} (sampled {len(sampled_candidate)})"
    )
    
    return all_sampled


# ---------------------------------------------------------------------------
# Core: Download single star (Thread-safe)
# ---------------------------------------------------------------------------

# Thread lock to prevent concurrent access to FITS caching / file operations
download_lock = threading.Lock()


def _clear_corrupt_cache(koi_star_id: str):
    """Scan and delete lightkurve cache directories matching the kepid of the star."""
    import shutil
    kepid = STAR_TO_KEPID.get(koi_star_id)
    if not kepid:
        return
        
    cache_root = Path.home() / ".lightkurve" / "cache"
    if not cache_root.exists():
        return
        
    # Search for directories/files matching the kepid pattern
    pattern = f"kplr*{kepid}*"
    deleted_any = False
    
    for path in cache_root.glob(f"**/{pattern}"):
        try:
            if path.is_dir():
                shutil.rmtree(path)
                logger.warning(f"Cleared corrupt cache directory: {path}")
                deleted_any = True
            elif path.is_file():
                path.unlink()
                logger.warning(f"Cleared corrupt cache file: {path}")
                deleted_any = True
        except Exception as e:
            logger.error(f"Failed to clear cache path {path}: {e}")
            
    if not deleted_any:
        # Fallback: check mastDownload folder directly
        mast_dir = cache_root / "mastDownload" / "Kepler"
        if mast_dir.exists():
            for folder in mast_dir.glob(f"*kplr*{kepid}*"):
                try:
                    shutil.rmtree(folder)
                    logger.warning(f"Cleared corrupt folder in mastDownload: {folder}")
                except Exception as e:
                    logger.error(f"Failed to clear mast folder {folder}: {e}")


@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=RETRY_WAIT_MIN, max=RETRY_WAIT_MAX),
    retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def download_star_lightcurve(koi_star_id: str) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Download and stitch light curve (parallelized, slice-limited)."""
    koi_number = int(koi_star_id[1:])
    search_name = f"KOI-{koi_number}"

    try:
        # Search MAST
        search_result = lk.search_lightcurve(
            search_name,
            mission="Kepler",
            cadence="long",
            author="Kepler",
        )

        if len(search_result) == 0:
            return None

        # Limit download to first 6 quarters (1.5 years) to speed up download by 3x
        if len(search_result) > 6:
            search_result = search_result[:6]

        # Download (no lock: parallel network downloads, astropy progress bar monkeypatched)
        lc_collection = search_result.download_all(quality_bitmask="default")
        
        # Stitch and extract (with lock: serializes FITS file reading)
        with download_lock:
            stitched_lc = lc_collection.stitch()
            time_array = stitched_lc.time.value.copy().astype(np.float64)
            flux_array = stitched_lc.flux.value.copy().astype(np.float64)
            
    except Exception as e:
        # Check if exception is related to truncated/corrupted FITS reading
        err_msg = str(e)
        if "truncated" in err_msg.lower() or "corrupt" in err_msg.lower() or "fits" in err_msg.lower() or "empty" in err_msg.lower() or "header" in err_msg.lower():
            logger.warning(f"Detected corrupt cache/fits error for {koi_star_id}: {e}. Clearing cache and retrying...")
            with download_lock:
                _clear_corrupt_cache(koi_star_id)
            # Re-attempt once within the same call (cache=False bypasses astropy's corrupted cache)
            search_result = lk.search_lightcurve(
                search_name,
                mission="Kepler",
                cadence="long",
                author="Kepler",
            )
            if len(search_result) == 0:
                return None
            if len(search_result) > 6:
                search_result = search_result[:6]
            lc_collection = search_result.download_all(quality_bitmask="default", cache=False)
            
            with download_lock:
                stitched_lc = lc_collection.stitch()
                time_array = stitched_lc.time.value.copy().astype(np.float64)
                flux_array = stitched_lc.flux.value.copy().astype(np.float64)
        else:
            raise e

    # Filter NaNs
    valid_mask = np.isfinite(time_array) & np.isfinite(flux_array)
    time_array = time_array[valid_mask]
    flux_array = flux_array[valid_mask]

    if len(time_array) == 0:
        return None

    return time_array, flux_array


def process_single_star(star_id: str) -> str:
    """Thread wrapper to download and save a single star."""
    output_path = OUTPUT_DIR / f"{star_id}.npz"

    # Rate limiting: add a small jitter/delay so threads don't hit MAST at the exact same instant
    time.sleep(np.random.uniform(0.1, MIN_REQUEST_INTERVAL))

    try:
        result = download_star_lightcurve(star_id)
        if result is None:
            return f"{star_id}: NO_DATA"

        time_array, flux_array = result
        np.savez_compressed(output_path, time=time_array, flux=flux_array)
        file_size_kb = output_path.stat().st_size / 1024
        return f"{star_id}: SUCCESS ({file_size_kb:.0f} KB)"
    except Exception as e:
        import traceback
        logger.error(f"Error details for {star_id}:")
        traceback.print_exc()
        return f"{star_id}: FAILED ({e})"


# ---------------------------------------------------------------------------
# Main parallel loop
# ---------------------------------------------------------------------------

def main():
    if not CATALOG_PATH.exists():
        logger.error(f"KOI catalog not found at: {CATALOG_PATH}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    star_ids = load_balanced_star_ids(CATALOG_PATH)

    # Filter out stars that we already have downloaded (resumability)
    queue = []
    skipped = 0
    for star_id in star_ids:
        if (OUTPUT_DIR / f"{star_id}.npz").exists():
            skipped += 1
        else:
            queue.append(star_id)

    logger.info(
        f"Queue status:\n"
        f"  - Already downloaded and skipping: {skipped}\n"
        f"  - Pending download in this run:     {len(queue)}"
    )

    if not queue:
        logger.info("All targets already downloaded!")
        sys.exit(0)

    # Run downloads in parallel using ThreadPoolExecutor
    logger.info(f"Starting parallel download with {MAX_WORKERS} workers...")
    logger.info("=" * 60)

    success_count = 0
    no_data_count = 0
    fail_count = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="MASTWorker") as executor:
        # Submit all tasks
        futures = {executor.submit(process_single_star, star_id): star_id for star_id in queue}
        
        # Display progress bar as they complete
        for future in tqdm(as_completed(futures), total=len(queue), desc="Downloading", unit="star"):
            star_id = futures[future]
            try:
                status = future.result()
                if "SUCCESS" in status:
                    success_count += 1
                    logger.info(f"Progress — {status}")
                elif "NO_DATA" in status:
                    no_data_count += 1
                    logger.warning(f"Progress — {status}")
                else:
                    fail_count += 1
                    logger.error(f"Progress — {status}")
            except Exception as exc:
                fail_count += 1
                logger.error(f"Progress — {star_id} generated an exception: {exc}")

    # Report results
    total_files = len(list(OUTPUT_DIR.glob("*.npz")))
    total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.npz")) / (1024 * 1024)
    
    logger.info("=" * 60)
    logger.info("Parallel download session finished!")
    logger.info(f"  Successfully downloaded: {success_count}")
    logger.info(f"  Skipped (No Data):        {no_data_count}")
    logger.info(f"  Failed:                  {fail_count}")
    logger.info(f"  Total stars on disk:     {total_files}")
    logger.info(f"  Total directory size:    {total_size_mb:.1f} MB")


if __name__ == "__main__":
    main()
