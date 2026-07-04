/* ============================================================
   Exovision API Client
   Typed fetch wrappers for the FastAPI backend
   ============================================================ */

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// ---- Types matching backend Pydantic schemas ----

export interface StarColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export interface StarData {
  kepid: number;
  teff_k: number;
  radius_rsun: number;
  mass_msun: number;
  luminosity_lsun: number;
  surface_gravity_logg: number;
  spectral_type: string;
  color: StarColor;
}

export interface HabitableZoneBounds {
  inner_au: number;
  outer_au: number;
}

export interface HabitableZone {
  conservative: HabitableZoneBounds;
  optimistic: HabitableZoneBounds;
}

export interface PlanetData {
  koi_name: string;
  kepler_name: string | null;
  period_days: number;
  radius_rearth: number;
  radius_rjupiter: number;
  size_class: string;
  orbital_distance_au: number;
  transit_depth_ppm: number;
  transit_duration_hours: number;
  equilibrium_temp_k: number;
  in_habitable_zone: boolean;
  classification: string;
  confidence: number;
}

export interface LightCurveData {
  global_view: number[];
  local_view: number[];
  saliency_global: number[];
  saliency_local: number[];
}

export interface SystemResponse {
  star: StarData;
  planets: PlanetData[];
  habitable_zone: HabitableZone;
  light_curve: LightCurveData;
}

export interface CatalogEntry {
  koi_name: string;
  kepler_name: string | null;
  disposition: string;
  period_days: number;
  radius_rearth: number | null;
  has_processed_data: boolean;
}

export interface CatalogResponse {
  total: number;
  entries: CatalogEntry[];
}

// ---- API Functions ----

export async function fetchSystem(koiName: string): Promise<SystemResponse> {
  const res = await fetch(`${API_BASE}/system/${encodeURIComponent(koiName)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

export async function fetchCatalog(params: {
  search?: string;
  processedOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<CatalogResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.processedOnly) qs.set('processed_only', 'true');
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  
  const res = await fetch(`${API_BASE}/catalog/?${qs.toString()}`);
  if (!res.ok) throw new Error(`Catalog API error ${res.status}`);
  return res.json();
}
