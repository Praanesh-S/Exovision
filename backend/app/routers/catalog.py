"""
Catalog Router
==============
GET /catalog — List available KOI targets with optional search/filter.
               Used by the frontend dropdown/search component.
"""

import math
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.services import inference_service
from app.schemas import CatalogResponse, CatalogEntry

router = APIRouter()


@router.get("/", response_model=CatalogResponse)
async def list_catalog(
    search: Optional[str] = Query(None, description="Search by KOI name or Kepler name"),
    disposition: Optional[str] = Query(None, description="Filter by disposition (CONFIRMED, CANDIDATE, FALSE POSITIVE)"),
    processed_only: bool = Query(False, description="Only return targets with preprocessed ML data"),
    limit: int = Query(50, ge=1, le=500, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    List available exoplanet targets from the KOI catalog.
    
    Supports:
      - Text search by KOI name (K00001) or Kepler name (Kepler-1)
      - Filtering by disposition (CONFIRMED / CANDIDATE / FALSE POSITIVE)
      - Filtering to only show targets with preprocessed ML data
      - Pagination with limit/offset
    """
    if inference_service.catalog is None:
        raise HTTPException(status_code=503, detail="Catalog not loaded.")
    
    df = inference_service.catalog.copy()
    
    # Apply search filter
    if search:
        search_upper = search.upper().strip()
        name_mask = df["kepoi_name"].str.upper().str.contains(search_upper, na=False)
        kepler_mask = df["kepler_name"].astype(str).str.upper().str.contains(search_upper, na=False)
        df = df[name_mask | kepler_mask]
    
    # Apply disposition filter
    if disposition:
        df = df[df["koi_disposition"].str.upper() == disposition.upper()]
    
    total_before_processed = len(df)
    
    # Build entries
    entries = []
    for _, row in df.iterrows():
        koi = str(row["kepoi_name"]).strip()
        has_data = inference_service.get_processed_path(koi) is not None
        
        if processed_only and not has_data:
            continue
        
        kepler_name = row.get("kepler_name")
        if isinstance(kepler_name, float) and math.isnan(kepler_name):
            kepler_name = None
        elif kepler_name is not None:
            kepler_name = str(kepler_name).strip()
        
        prad = row.get("koi_prad")
        try:
            prad = float(prad)
            if math.isnan(prad):
                prad = None
        except (ValueError, TypeError):
            prad = None
        
        entries.append(CatalogEntry(
            koi_name=koi,
            kepler_name=kepler_name,
            disposition=str(row.get("koi_disposition", "UNKNOWN")),
            period_days=round(float(row.get("koi_period", 0)), 6),
            radius_rearth=round(prad, 2) if prad else None,
            has_processed_data=has_data,
        ))
    
    total = len(entries)
    
    # Apply pagination
    paginated = entries[offset:offset + limit]
    
    return CatalogResponse(total=total, entries=paginated)
