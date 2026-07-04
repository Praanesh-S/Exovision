"""
Exovision — Orbital Mechanics & Habitable Zone
===============================================
Derives orbital parameters and habitable zone boundaries.

Implements:
  - Kepler's Third Law:  a = (G M★ P² / 4π²)^(1/3)
  - Planet radius from transit depth: Rp = R★ √(δ)
  - Habitable zone boundaries (Kopparapu et al. 2013)
  - Equilibrium temperature estimation
"""

import math

# Physical constants
G = 6.67430e-11             # Gravitational constant (m³ kg⁻¹ s⁻²)
M_SUN = 1.989e30            # Solar mass (kg)
AU = 1.496e11               # Astronomical unit (m)
R_SUN = 6.957e8             # Solar radius (m)
R_EARTH = 6.371e6           # Earth radius (m)
R_JUPITER = 6.9911e7        # Jupiter radius (m)


def orbital_distance_au(period_days: float, stellar_mass_msun: float) -> float:
    """
    Calculate semi-major axis using Kepler's Third Law.
    
    a³ = G M★ P² / 4π²
    
    Args:
        period_days: Orbital period in days
        stellar_mass_msun: Stellar mass in solar masses
        
    Returns:
        Semi-major axis in AU
    """
    period_s = period_days * 86400.0
    mass_kg = stellar_mass_msun * M_SUN
    
    a_cubed = (G * mass_kg * period_s**2) / (4.0 * math.pi**2)
    a_meters = a_cubed ** (1.0 / 3.0)
    
    return a_meters / AU


def planet_radius_rearth(transit_depth_ppm: float, stellar_radius_rsun: float) -> float:
    """
    Derive planet radius from transit depth.
    
    Transit depth δ = (Rp / R★)²  →  Rp = R★ × √δ
    
    Args:
        transit_depth_ppm: Transit depth in parts-per-million (from catalog koi_depth)
        stellar_radius_rsun: Stellar radius in solar radii
        
    Returns:
        Planet radius in Earth radii
    """
    delta = transit_depth_ppm / 1e6  # Convert ppm to fractional
    r_planet_meters = stellar_radius_rsun * R_SUN * math.sqrt(delta)
    return r_planet_meters / R_EARTH


def planet_size_class(radius_rearth: float) -> str:
    """
    Classify planet by size using NASA's standard categories.
    """
    if radius_rearth < 1.0:
        return "Sub-Earth"
    elif radius_rearth < 1.75:
        return "Earth-size"
    elif radius_rearth < 3.5:
        return "Super-Earth"
    elif radius_rearth < 6.0:
        return "Sub-Neptune"
    elif radius_rearth < 14.3:
        return "Neptune-size"
    else:
        return "Jupiter-size"


def habitable_zone_au(luminosity_lsun: float) -> dict:
    """
    Calculate conservative habitable zone boundaries.
    Uses Kopparapu et al. (2013) empirical stellar flux boundaries
    (for main-sequence stars).
    
    Conservative HZ: Runaway Greenhouse (inner) to Maximum Greenhouse (outer)
    Optimistic HZ: Recent Venus (inner) to Early Mars (outer)
    
    Args:
        luminosity_lsun: Stellar luminosity in solar luminosities
        
    Returns:
        Dict with inner/outer boundaries in AU for both conservative and optimistic HZ
    """
    # Effective stellar flux boundaries (S_eff) from Kopparapu et al. 2013 (Table 3)
    # For a Sun-like star at Teff = 5780K
    s_inner_conservative = 1.0385   # Runaway Greenhouse
    s_outer_conservative = 0.3507   # Maximum Greenhouse
    s_inner_optimistic = 1.7763     # Recent Venus
    s_outer_optimistic = 0.3207     # Early Mars
    
    # HZ distance: d = √(L / S_eff)  in AU
    inner_conservative = math.sqrt(luminosity_lsun / s_inner_conservative)
    outer_conservative = math.sqrt(luminosity_lsun / s_outer_conservative)
    inner_optimistic = math.sqrt(luminosity_lsun / s_inner_optimistic)
    outer_optimistic = math.sqrt(luminosity_lsun / s_outer_optimistic)
    
    return {
        "conservative": {
            "inner_au": round(inner_conservative, 4),
            "outer_au": round(outer_conservative, 4),
        },
        "optimistic": {
            "inner_au": round(inner_optimistic, 4),
            "outer_au": round(outer_optimistic, 4),
        },
    }


def equilibrium_temperature(stellar_teff: float, stellar_radius_rsun: float, 
                             orbital_distance_au_val: float, albedo: float = 0.3) -> float:
    """
    Estimate the planet's equilibrium temperature.
    
    T_eq = T★ × √(R★ / 2a) × (1 - A)^(1/4)
    
    Args:
        stellar_teff: Stellar effective temperature (K)
        stellar_radius_rsun: Stellar radius in solar radii
        orbital_distance_au_val: Orbital distance in AU
        albedo: Bond albedo (default 0.3, Earth-like)
        
    Returns:
        Equilibrium temperature in Kelvin
    """
    r_star = stellar_radius_rsun * R_SUN
    a_meters = orbital_distance_au_val * AU
    
    if a_meters <= 0:
        return 0.0
        
    t_eq = stellar_teff * math.sqrt(r_star / (2.0 * a_meters)) * (1.0 - albedo)**0.25
    return round(t_eq, 1)


def is_in_habitable_zone(orbital_dist_au: float, hz_boundaries: dict) -> dict:
    """
    Determine if a planet's orbit falls within the habitable zone.
    
    Returns:
        Dict with boolean flags for conservative and optimistic HZ membership.
    """
    cons = hz_boundaries["conservative"]
    opt = hz_boundaries["optimistic"]
    
    return {
        "conservative": cons["inner_au"] <= orbital_dist_au <= cons["outer_au"],
        "optimistic": opt["inner_au"] <= orbital_dist_au <= opt["outer_au"],
    }
