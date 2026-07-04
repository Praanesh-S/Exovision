"""
Exovision — Catalog Validator
==============================
Quick validation script to run after downloading the KOI cumulative CSV.
Checks that the file is in the right place, has the expected columns,
and gives you a summary of the dataset before starting the long download.

Usage:
    cd backend
    python -m scripts.validate_catalog
"""

import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = PROJECT_ROOT / "data" / "catalog" / "koi_cumulative.csv"

# Columns we require for the ML pipeline and physics layer
REQUIRED_COLUMNS = [
    "kepoi_name",       # KOI designation (e.g., K00752.01)
    "koi_disposition",  # Label: CONFIRMED, CANDIDATE, FALSE POSITIVE
    "koi_period",       # Orbital period (days)
    "koi_duration",     # Transit duration (hours)
    "koi_depth",        # Transit depth (ppm)
    "koi_prad",         # Planet radius (Earth radii)
    "koi_srad",         # Stellar radius (Solar radii)
    "koi_steff",        # Stellar effective temperature (K)
    "koi_slogg",        # Stellar surface gravity (log10 cm/s²)
]

# Columns that are very useful but not strictly required
RECOMMENDED_COLUMNS = [
    "koi_time0bk",      # Transit epoch — needed for phase-folding
    "koi_smass",        # Stellar mass — needed for Kepler's 3rd law
    "kepler_name",      # Confirmed Kepler name (e.g., Kepler-227 b)
]


def main():
    print("=" * 60)
    print("Exovision — KOI Catalog Validator")
    print("=" * 60)

    # 1. Check file exists
    if not CATALOG_PATH.exists():
        print(f"\n❌ CATALOG NOT FOUND at: {CATALOG_PATH}")
        print(f"\nPlease download the KOI Cumulative Table from:")
        print(f"   https://exoplanetarchive.ipac.caltech.edu/")
        print(f"and save it as: {CATALOG_PATH}")
        sys.exit(1)

    print(f"\n✅ Catalog found: {CATALOG_PATH}")
    file_size_mb = CATALOG_PATH.stat().st_size / (1024 * 1024)
    print(f"   File size: {file_size_mb:.1f} MB")

    # 2. Load and parse
    try:
        df = pd.read_csv(CATALOG_PATH, comment="#")
    except Exception as e:
        print(f"\n❌ FAILED TO PARSE CSV: {e}")
        sys.exit(1)

    print(f"   Rows: {len(df):,}")
    print(f"   Columns: {len(df.columns)}")

    # 3. Check required columns
    print(f"\n--- Required Columns ---")
    missing_required = []
    for col in REQUIRED_COLUMNS:
        if col in df.columns:
            non_null = df[col].notna().sum()
            pct = 100 * non_null / len(df)
            print(f"   ✅ {col:20s}  {non_null:>6,} / {len(df):,} non-null ({pct:.1f}%)")
        else:
            print(f"   ❌ {col:20s}  MISSING")
            missing_required.append(col)

    if missing_required:
        print(f"\n❌ Missing {len(missing_required)} required columns: {missing_required}")
        print("   Please re-download with the correct column selection.")
        sys.exit(1)

    # 4. Check recommended columns
    print(f"\n--- Recommended Columns ---")
    for col in RECOMMENDED_COLUMNS:
        if col in df.columns:
            non_null = df[col].notna().sum()
            pct = 100 * non_null / len(df)
            print(f"   ✅ {col:20s}  {non_null:>6,} / {len(df):,} non-null ({pct:.1f}%)")
        else:
            print(f"   ⚠️  {col:20s}  MISSING (recommended but not required)")

    # 5. Class distribution — this is critical for understanding class imbalance
    print(f"\n--- Class Distribution (koi_disposition) ---")
    class_counts = df["koi_disposition"].value_counts()
    for label, count in class_counts.items():
        pct = 100 * count / len(df)
        bar = "█" * int(pct / 2)
        print(f"   {label:20s}  {count:>5,}  ({pct:5.1f}%)  {bar}")

    # 6. Unique stars
    star_ids = df["kepoi_name"].str.split(".").str[0].unique()
    print(f"\n--- Summary ---")
    print(f"   Total KOIs:       {len(df):,}")
    print(f"   Unique stars:     {len(star_ids):,}")
    print(f"   Multi-planet:     {len(df) - len(star_ids):,} additional candidates on shared stars")

    # 7. Quick physics sanity check
    print(f"\n--- Physical Parameter Ranges ---")
    for col, unit, sane_min, sane_max in [
        ("koi_period", "days", 0.1, 1000),
        ("koi_depth", "ppm", 1, 100000),
        ("koi_prad", "R⊕", 0.1, 100),
        ("koi_steff", "K", 2500, 50000),
        ("koi_srad", "R☉", 0.1, 100),
    ]:
        if col in df.columns:
            vals = df[col].dropna()
            in_range = ((vals >= sane_min) & (vals <= sane_max)).sum()
            pct = 100 * in_range / len(vals) if len(vals) > 0 else 0
            print(
                f"   {col:15s}  median={vals.median():>10.2f} {unit:5s}  "
                f"range=[{vals.min():.2f}, {vals.max():.2f}]  "
                f"({pct:.0f}% in sane range)"
            )

    print(f"\n{'=' * 60}")
    print(f"✅ Catalog looks good! You can now run the light curve downloader:")
    print(f"   python -m scripts.download_lightcurves")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
