"""
Exovision Physics Module
========================
This package will contain:
  - transit.py     — Transit depth → planet/star radius ratio (Phase 4)
  - orbits.py      — Kepler's third law: period + stellar mass → orbital distance (Phase 4)
  - habitable.py   — Habitable zone boundaries from stellar temp + luminosity (Phase 4)
  - stellar.py     — Stellar parameter derivations (luminosity from Teff + radius) (Phase 4)

All calculations use real astrophysical formulas with proper unit handling
via astropy.units. No approximations without explicit documentation.

Key formulas planned:
  - Planet radius: Rp = R★ × √(transit_depth)
  - Orbital distance (Kepler's 3rd): a = (G × M★ × P² / 4π²)^(1/3)
  - Habitable zone: based on Kopparapu et al. (2013) effective flux boundaries
  - Stellar luminosity: L = 4π × R★² × σ × Teff⁴
"""
