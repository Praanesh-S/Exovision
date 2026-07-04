"""
System Data Router
==================
GET /system/{koi_name} — Return everything the frontend needs to render a
                          complete exoplanet system in 3D:
                          - Star properties (temp, radius, mass, color)
                          - All planets orbiting the star (with physical parameters)
                          - Habitable zone boundaries
                          - Phase-folded light curves + saliency maps
"""

import math
import logging
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException

from app.services import inference_service
from app.schemas import (
    SystemResponse, StarData, StarColor, PlanetData,
    HabitableZone, HabitableZoneBounds, LightCurveData,
)
from app.physics.stellar import stellar_luminosity, spectral_type, temperature_to_rgb
from app.physics.orbits import (
    orbital_distance_au, planet_radius_rearth, planet_size_class,
    habitable_zone_au, equilibrium_temperature, is_in_habitable_zone,
    R_EARTH, R_JUPITER,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert a catalog value to float, handling NaN and missing values."""
    try:
        f = float(val)
        return f if not math.isnan(f) else default
    except (ValueError, TypeError):
        return default


@router.get("/{koi_name}", response_model=SystemResponse)
async def get_system(koi_name: str):
    """
    Retrieve complete system data for 3D rendering.
    
    Given a KOI identifier (e.g. K00001.01), returns:
      - Host star physical properties (temperature, radius, mass, luminosity, color)
      - All detected planets in the system (with derived radius, orbit, HZ status)
      - Habitable zone boundaries for the star
      - Phase-folded light curves and gradient saliency maps
      
    The frontend uses this single response to render the entire Three.js scene
    and the synced transit chart.
    """
    if not inference_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Service not ready. Model or catalog not loaded."
        )
    
    # Look up the primary KOI in the catalog
    primary_row = inference_service.get_koi_row(koi_name)
    if primary_row is None:
        raise HTTPException(
            status_code=404,
            detail=f"KOI '{koi_name}' not found in the catalog."
        )
    
    # ─── Star Data ──────────────────────────────────────────────────
    kepid = int(primary_row["kepid"])
    teff = _safe_float(primary_row.get("koi_steff"), 5778.0)
    srad = _safe_float(primary_row.get("koi_srad"), 1.0)
    smass = _safe_float(primary_row.get("koi_smass"), 1.0)
    slogg = _safe_float(primary_row.get("koi_slogg"), 4.44)
    
    luminosity = stellar_luminosity(teff, srad)
    spec_type = spectral_type(teff)
    color_dict = temperature_to_rgb(teff)
    
    star = StarData(
        kepid=kepid,
        teff_k=teff,
        radius_rsun=srad,
        mass_msun=smass,
        luminosity_lsun=round(luminosity, 4),
        surface_gravity_logg=slogg,
        spectral_type=spec_type,
        color=StarColor(**color_dict),
    )
    
    # ─── Habitable Zone ────────────────────────────────────────────
    hz_dict = habitable_zone_au(luminosity)
    hz = HabitableZone(
        conservative=HabitableZoneBounds(**hz_dict["conservative"]),
        optimistic=HabitableZoneBounds(**hz_dict["optimistic"]),
    )
    
    # ─── All Planets in the System ─────────────────────────────────
    # Extract the star prefix (e.g. K00001) from the full KOI name (K00001.01)
    star_prefix = koi_name.split(".")[0]
    koi_rows = inference_service.get_star_kois(star_prefix)
    
    # If no multi-planet data found, fall back to just the requested KOI
    if koi_rows.empty:
        koi_rows = inference_service.catalog[
            inference_service.catalog["kepoi_name"] == koi_name
        ]
    
    planets = []
    for _, row in koi_rows.iterrows():
        this_koi = str(row["kepoi_name"]).strip()
        period = _safe_float(row.get("koi_period"), 1.0)
        depth = _safe_float(row.get("koi_depth"), 0.0)
        duration = _safe_float(row.get("koi_duration"), 0.0)
        
        # Derive physical parameters
        p_radius = planet_radius_rearth(depth, srad) if depth > 0 else _safe_float(row.get("koi_prad"), 0.0)
        p_radius_rj = (p_radius * R_EARTH) / R_JUPITER
        orbit_au = orbital_distance_au(period, smass)
        size_cls = planet_size_class(p_radius)
        eq_temp = equilibrium_temperature(teff, srad, orbit_au)
        in_hz = is_in_habitable_zone(orbit_au, hz_dict)
        
        # Get ML classification for this specific KOI (if processed)
        classification = "UNKNOWN"
        confidence = 0.0
        # Download if this is the primary KOI being viewed, otherwise check cache
        should_download = (this_koi == koi_name)
        result = inference_service.classify(this_koi, download_if_missing=should_download)
        if result:
            classification = result["classification"]
            confidence = result["confidence"]
        else:
            # Fall back to catalog disposition
            classification = str(row.get("koi_disposition", "UNKNOWN"))
        
        kepler_name = row.get("kepler_name")
        if isinstance(kepler_name, float) and math.isnan(kepler_name):
            kepler_name = None
        elif kepler_name is not None:
            kepler_name = str(kepler_name).strip()
        
        planets.append(PlanetData(
            koi_name=this_koi,
            kepler_name=kepler_name,
            period_days=round(period, 6),
            radius_rearth=round(p_radius, 2),
            radius_rjupiter=round(p_radius_rj, 3),
            size_class=size_cls,
            orbital_distance_au=round(orbit_au, 4),
            transit_depth_ppm=round(depth, 1),
            transit_duration_hours=round(duration, 2),
            equilibrium_temp_k=eq_temp,
            in_habitable_zone=in_hz["conservative"],
            classification=classification,
            confidence=round(confidence, 4),
        ))
    
    # Sort planets by orbital distance (closest first)
    planets.sort(key=lambda p: p.orbital_distance_au)
    
    # ─── Light Curve Data ──────────────────────────────────────────
    # Use the primary (requested) KOI for the light curve (download if missing from cache)
    primary_result = inference_service.classify(koi_name, download_if_missing=True)
    if primary_result:
        light_curve = LightCurveData(
            global_view=primary_result["global_view"],
            local_view=primary_result["local_view"],
            saliency_global=primary_result["saliency_global"],
            saliency_local=primary_result["saliency_local"],
        )
    else:
        # No processed data — return empty arrays
        light_curve = LightCurveData(
            global_view=[0.0] * 1000,
            local_view=[0.0] * 200,
            saliency_global=[0.0] * 1000,
            saliency_local=[0.0] * 200,
        )
    
    return SystemResponse(
        star=star,
        planets=planets,
        habitable_zone=hz,
        light_curve=light_curve,
    )
