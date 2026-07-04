# 🌌 Exovision

**An AI system that hunts for exoplanets in NASA's telescope data — and lets you fly through the star systems it finds.**

Exovision takes raw stellar brightness data from NASA's Kepler mission, runs it through a custom deep learning model to classify whether a star hosts a real exoplanet, and renders the entire star system in an interactive 3D simulator — orbits, habitable zones, and all.

> Built by [Praanesh S](https://github.com/Praanesh-S) — a project born out of a lifelong obsession with astrophysics and a desire to actually *do* the science, not just read about it.

---

## What It Does

1. **Feeds it a star** — from the Kepler Objects of Interest (KOI) catalog.
2. **Pulls the light curve** — the star's brightness recorded over thousands of hours, straight from NASA's MAST archive.
3. **Classifies the signal** — a dual-branch 1D-CNN looks for the tiny, periodic dip in brightness that indicates a planet passing in front of its star (a "transit"), and decides: `CONFIRMED`, `CANDIDATE`, or `FALSE POSITIVE`.
4. **Explains itself** — gradient saliency maps highlight exactly which part of the light curve drove the model's decision.
5. **Builds the system** — real stellar physics (Stefan-Boltzmann law, Kepler's third law, Kopparapu habitable zone boundaries) reconstructs the star's size, temperature, color, and the planet's orbit, radius, and equilibrium temperature.
6. **Visualizes it** — a Three.js scene renders the host star (photorealistic glow, correct color temperature) with planets orbiting at true relative scale, habitable zone boundaries, and the live phase-folded light curve synced to the animation.

---

## Why It Exists

Every exoplanet we know about was found by staring at light curves and catching an almost imperceptible dip in brightness — sometimes less than 0.01%. NASA's own pipelines use models very similar in spirit to this one. Exovision was built to actually understand that process end-to-end: from raw noisy telescope data to a real classification, and then to make that discovery *tangible* — something you can see, orbit, and explore instead of a number in a spreadsheet.

---

## Model Performance

Trained on a balanced set of **3,470 stars** (1,500 Confirmed, 1,500 False Positives, 500 Candidates) sampled from the Kepler KOI catalog:

| Metric | Score |
|---|---|
| Overall Accuracy | **72%** |
| Weighted F1 | **74%** |
| Macro F1 | **67%** |
| Confirmed Planet Precision | **78%** |
| Confirmed Planet Recall | **87%** |
| Confirmed Planet F1 | **82%** |

The model reliably identifies confirmed planets — the class that matters most for a discovery tool — while staying robust against noisy false-positive signals like eclipsing binaries and instrumental artifacts.

**Physics sanity check** — running the model on Kepler-1 b (TrES-2 b), a well-known hot Jupiter:
- Predicted host star: G-type, T=5820K, matching catalog values
- Predicted orbit: 0.035 AU, 2.47-day period — matches published orbital parameters
- Correctly places the planet **outside** the habitable zone (too hot, too close)

---

## Tech Stack

**ML / Data**
- PyTorch — dual-branch 1D-CNN (global + local transit views)
- `lightkurve` + NASA MAST archive — raw light curve acquisition
- NumPy / Astropy — sigma-clipping, Savitzky-Golay detrending, phase-folding

**Backend**
- FastAPI — inference API, physics engine, catalog search
- Custom physics modules — Stefan-Boltzmann luminosity, Kepler's third law, Kopparapu habitable zone models

**Frontend**
- React + `@react-three/fiber` (Three.js) — real-time 3D star system rendering
- TailwindCSS — UI

---

## Project Structure

```
exovision/
├── backend/
│   ├── app/
│   │   ├── ml/            # model.py, train.py, explain.py, preprocess.py
│   │   ├── physics/       # stellar.py, orbits.py
│   │   ├── routers/       # classify.py, system.py, catalog.py
│   │   ├── schemas.py
│   │   ├── services.py
│   │   └── main.py
│   └── scripts/           # download_lightcurves.py, validate_catalog.py
├── frontend/
│   └── src/                # React + Three.js scene, UI components
└── models/saved/            # trained checkpoints
```

---

## Running It Locally

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Once both are running, hit `POST /classify/?koi_name=K00001.01` or open the frontend to search the catalog and explore a system in 3D.

---

## Key API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/classify/?koi_name=...` | POST | Runs the CNN on a star's light curve, returns classification, confidence, and saliency map |
| `/system/{koi_name}` | GET | Full 3D scene data — star properties, planets, habitable zone, light curve |
| `/catalog/?search=...` | GET | Search and paginate the KOI catalog |

---

## Acknowledgments

- **NASA Kepler Mission** and the **MAST archive** for the light curve data that makes this possible
- The exoplanet research community, whose published transit-detection methods this project is directly inspired by

---

## Author

**Praanesh S**
[GitHub](https://github.com/Praanesh-S) · [LinkedIn](https://linkedin.com/in/praaneshsrinivasan)
