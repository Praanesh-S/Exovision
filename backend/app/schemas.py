"""
Exovision — API Response Schemas
================================
Pydantic models defining the shape of all API responses.
The frontend TypeScript types should mirror these exactly.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Classification response
# ---------------------------------------------------------------------------
class ClassificationScores(BaseModel):
    """Confidence scores per class from the softmax output."""
    confirmed: float = Field(..., description="Probability of being a confirmed planet")
    candidate: float = Field(..., description="Probability of being a candidate")
    false_positive: float = Field(..., description="Probability of being a false positive")


class SaliencyData(BaseModel):
    """Gradient saliency importance scores for explainability."""
    global_view: List[float] = Field(..., description="Saliency over the 1000-bin global view")
    local_view: List[float] = Field(..., description="Saliency over the 200-bin local view")


class ClassifyResponse(BaseModel):
    """Full response from POST /classify."""
    koi_name: str = Field(..., description="KOI identifier (e.g. K00001.01)")
    classification: str = Field(..., description="Predicted class label")
    confidence: float = Field(..., description="Confidence of the winning class")
    scores: ClassificationScores
    saliency: SaliencyData
    global_view: List[float] = Field(..., description="The 1000-bin phase-folded global view")
    local_view: List[float] = Field(..., description="The 200-bin phase-folded local view")


# ---------------------------------------------------------------------------
# System data response (for 3D visualization)
# ---------------------------------------------------------------------------
class StarColor(BaseModel):
    """RGB color derived from effective temperature for Three.js rendering."""
    r: int
    g: int
    b: int
    hex: str


class StarData(BaseModel):
    """Physical properties of the host star."""
    kepid: int = Field(..., description="Kepler Input Catalog ID")
    teff_k: float = Field(..., description="Effective temperature (K)")
    radius_rsun: float = Field(..., description="Radius in solar radii")
    mass_msun: float = Field(..., description="Mass in solar masses")
    luminosity_lsun: float = Field(..., description="Luminosity in solar luminosities")
    surface_gravity_logg: float = Field(..., description="Surface gravity (log g)")
    spectral_type: str = Field(..., description="Estimated spectral type (O/B/A/F/G/K/M)")
    color: StarColor = Field(..., description="RGB color for Three.js rendering")


class HabitableZoneBounds(BaseModel):
    """Inner and outer boundaries of the habitable zone."""
    inner_au: float
    outer_au: float


class HabitableZone(BaseModel):
    """Conservative and optimistic habitable zone boundaries."""
    conservative: HabitableZoneBounds
    optimistic: HabitableZoneBounds


class PlanetData(BaseModel):
    """Physical properties of a detected planet candidate."""
    koi_name: str = Field(..., description="KOI identifier (e.g. K00001.01)")
    kepler_name: Optional[str] = Field(None, description="Confirmed Kepler name (e.g. Kepler-1 b)")
    period_days: float = Field(..., description="Orbital period in days")
    radius_rearth: float = Field(..., description="Planet radius in Earth radii")
    radius_rjupiter: float = Field(..., description="Planet radius in Jupiter radii")
    size_class: str = Field(..., description="Size classification (e.g. Super-Earth)")
    orbital_distance_au: float = Field(..., description="Semi-major axis in AU")
    transit_depth_ppm: float = Field(..., description="Transit depth in parts-per-million")
    transit_duration_hours: float = Field(..., description="Transit duration in hours")
    equilibrium_temp_k: float = Field(..., description="Estimated equilibrium temperature (K)")
    in_habitable_zone: bool = Field(..., description="Whether the planet orbits within the conservative HZ")
    classification: str = Field(..., description="ML-predicted class label")
    confidence: float = Field(..., description="ML confidence for the prediction")


class LightCurveData(BaseModel):
    """Phase-folded light curve arrays for the transit chart."""
    global_view: List[float] = Field(..., description="1000-bin global phase-folded view")
    local_view: List[float] = Field(..., description="200-bin local transit view")
    saliency_global: List[float] = Field(..., description="Saliency over global view")
    saliency_local: List[float] = Field(..., description="Saliency over local view")


class SystemResponse(BaseModel):
    """Full response from GET /system/{koi_name}. Contains everything the frontend needs
    to render the 3D scene + synced transit chart."""
    star: StarData
    planets: List[PlanetData]
    habitable_zone: HabitableZone
    light_curve: LightCurveData


# ---------------------------------------------------------------------------
# Catalog listing (for the frontend search/dropdown)
# ---------------------------------------------------------------------------
class CatalogEntry(BaseModel):
    """Summary entry for listing available KOIs."""
    koi_name: str
    kepler_name: Optional[str] = None
    disposition: str
    period_days: float
    radius_rearth: Optional[float] = None
    has_processed_data: bool = Field(..., description="Whether we have ML-ready views for this target")


class CatalogResponse(BaseModel):
    """Response from GET /catalog."""
    total: int
    entries: List[CatalogEntry]
