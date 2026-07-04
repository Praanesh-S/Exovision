"""
Exovision ML Module
===================
This package will contain:
  - model.py       — 1D-CNN architecture definition (Phase 3)
  - train.py       — Training loop with class-weighted loss (Phase 3)
  - inference.py   — Model loading and prediction for serving (Phase 4)
  - explain.py     — SHAP / saliency-based explainability (Phase 3)
  - preprocess.py  — Light curve preprocessing pipeline (Phase 2)

The model classifies phase-folded Kepler/TESS light curves into:
  CONFIRMED — confirmed exoplanet transit
  CANDIDATE — planet candidate (not yet confirmed or refuted)
  FALSE_POSITIVE — eclipsing binary, instrumental artifact, etc.
"""
