# Exovision

**Exoplanet Transit Classifier + 3D Orbital Simulator**

A full-stack ML + visualization system that classifies real NASA Kepler/TESS light curves and renders physically accurate 3D orbital simulations synced in real time to animated phase-folded light curves.

## Architecture

```
exovision/
├── backend/          # FastAPI + PyTorch ML pipeline
│   └── app/
│       ├── main.py         # FastAPI application entry
│       ├── core/           # Configuration, constants
│       ├── routers/        # API route handlers
│       ├── ml/             # Model training, inference, explainability
│       └── physics/        # Kepler's 3rd law, HZ calc, transit physics
├── frontend/         # React + Three.js visualization
│   └── src/
│       ├── pages/          # Route-level page components
│       ├── components/     # Reusable UI + 3D components
│       └── lib/            # API client, utilities
├── data/             # (gitignored) Local data storage
│   ├── raw/                # Raw light curve FITS files
│   ├── processed/          # Preprocessed, phase-folded arrays
│   └── catalog/            # NASA Exoplanet Archive CSV exports
└── models/           # (gitignored) Trained model checkpoints
```

## Features

| Feature | Status |
|---------|--------|
| 1D-CNN classifier on raw phase-folded light curves | 🔜 Phase 3 |
| Physically accurate 3D orbital simulator (Three.js) | 🔜 Phase 5 |
| Real-time light curve ↔ 3D transit sync | 🔜 Phase 5 |
| Habitable zone overlay + scoring | 🔜 Phase 5 |
| SHAP-based explainability | 🔜 Phase 3 |
| Live TESS candidate scanning | 🔜 Phase 6 |
| FastAPI REST backend | 🔜 Phase 4 |
| Cloud Run deployment | 🔜 Phase 6 |

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000/health
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Data Sources

- **Labels**: [NASA Exoplanet Archive — KOI Cumulative Table](https://exoplanetarchive.ipac.caltech.edu/)
- **Light Curves**: [MAST Archive](https://archive.stsci.edu/) via [`lightkurve`](https://docs.lightkurve.org/)

## Tech Stack

- **ML**: PyTorch, scikit-learn, SHAP, lightkurve, astropy
- **Backend**: FastAPI, uvicorn
- **Frontend**: React, TypeScript, @react-three/fiber, Recharts, TailwindCSS v4
- **Deployment**: Docker, Google Cloud Run

## License

Private — not yet licensed for distribution.
