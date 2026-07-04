"""
Exovision FastAPI Application
=============================
Main entry point for the Exovision backend. Serves:
  - Model inference (classify light curves as CONFIRMED / CANDIDATE / FALSE POSITIVE)
  - Derived physical parameters (planet radius, orbital distance, HZ status)
  - System data for the 3D orbital simulator
  - Catalog search/listing for the frontend

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import classify, system, catalog
from app.services import inference_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — load model + catalog once at startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the trained model and KOI catalog into memory at startup."""
    logger.info("=" * 60)
    logger.info("Exovision API starting up...")
    
    # Load catalog
    catalog_ok = inference_service.load_catalog()
    if catalog_ok:
        logger.info("Catalog loaded successfully.")
    else:
        logger.warning("Catalog failed to load. System/catalog endpoints will be unavailable.")
    
    # Load model
    model_ok = inference_service.load_model()
    if model_ok:
        logger.info("Model loaded successfully.")
    else:
        logger.warning("Model checkpoint not found. Classification will be unavailable.")
    
    logger.info(f"Service ready: model={'OK' if model_ok else 'MISSING'}, catalog={'OK' if catalog_ok else 'MISSING'}")
    logger.info("=" * 60)
    
    yield  # App is running
    
    # Shutdown
    logger.info("Exovision API shutting down.")


# ---------------------------------------------------------------------------
# App initialization
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Exovision API",
    description=(
        "Exoplanet transit classification and 3D orbital simulation backend. "
        "Classifies Kepler/TESS light curves and serves derived physical "
        "parameters for real-time 3D visualization."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow the React dev server (and future production origins)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------
app.include_router(classify.router, prefix="/classify", tags=["Classification"])
app.include_router(system.router, prefix="/system", tags=["System Data"])
app.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])


# ---------------------------------------------------------------------------
# Health check — used by Cloud Run probes and local smoke tests
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Infrastructure"])
async def health_check():
    """Returns service health status and readiness of model/catalog."""
    return {
        "status": "ok",
        "service": "exovision-api",
        "version": "0.1.0",
        "model_loaded": inference_service._model_loaded,
        "catalog_loaded": inference_service.catalog is not None,
    }
