"""
Classification Router
=====================
POST /classify — Accept a KOI name, run inference through the trained 1D-CNN,
                 and return classification, confidence scores, light curve views,
                 and gradient saliency maps for explainability.
"""

from fastapi import APIRouter, HTTPException, Query

from app.services import inference_service
from app.schemas import ClassifyResponse, ClassificationScores, SaliencyData

router = APIRouter()


@router.post("/", response_model=ClassifyResponse)
async def classify_light_curve(
    koi_name: str = Query(
        ..., 
        description="KOI identifier (e.g. K00001.01)",
        examples=["K00001.01"]
    )
):
    """
    Classify an exoplanet transit light curve.
    
    Runs the preprocessed phase-folded views through the AstroNet 1D-CNN and returns:
      - Classification label (CONFIRMED / CANDIDATE / FALSE POSITIVE)
      - Per-class confidence scores
      - Gradient saliency maps showing which parts of the light curve influenced the decision
      - The actual light curve views (for rendering in the frontend chart)
    """
    if not inference_service.is_ready:
        raise HTTPException(
            status_code=503,
            detail="Model or catalog not loaded. The server is still initializing."
        )
    
    # Run inference (which handles dynamic download & preprocessing if not cached)
    result = inference_service.classify(koi_name)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No target found for '{koi_name}'. This Kepler ID is either invalid, "
                   f"not in the cumulative catalog, or failed to download from MAST."
        )
    
    return ClassifyResponse(
        koi_name=koi_name,
        classification=result["classification"],
        confidence=result["confidence"],
        scores=ClassificationScores(**result["scores"]),
        saliency=SaliencyData(
            global_view=result["saliency_global"],
            local_view=result["saliency_local"],
        ),
        global_view=result["global_view"],
        local_view=result["local_view"],
    )
