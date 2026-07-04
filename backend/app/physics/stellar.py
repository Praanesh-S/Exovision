"""
Exovision — Stellar Physics
============================
Derives physical stellar properties from catalog parameters.

Implements:
  - Stefan-Boltzmann luminosity:  L = 4π R²★ σ T⁴eff
  - Spectral type estimation from effective temperature
  - RGB color from temperature (for Three.js star rendering)
"""

import math

# Physical constants
SIGMA_SB = 5.670374419e-8     # Stefan-Boltzmann constant (W m⁻² K⁻⁴)
R_SUN = 6.957e8               # Solar radius (m)
L_SUN = 3.828e26              # Solar luminosity (W)


def stellar_luminosity(teff_k: float, radius_rsun: float) -> float:
    """
    Calculate stellar luminosity using the Stefan-Boltzmann law.
    
    L = 4π R² σ T⁴
    
    Args:
        teff_k: Effective temperature in Kelvin
        radius_rsun: Stellar radius in solar radii
        
    Returns:
        Luminosity in solar luminosities (L☉)
    """
    r_meters = radius_rsun * R_SUN
    luminosity_watts = 4.0 * math.pi * r_meters**2 * SIGMA_SB * teff_k**4
    return luminosity_watts / L_SUN


def spectral_type(teff_k: float) -> str:
    """
    Estimate Harvard spectral classification from effective temperature.
    Uses standard ranges from Carroll & Ostlie.
    """
    if teff_k >= 30000:
        return "O"
    elif teff_k >= 10000:
        return "B"
    elif teff_k >= 7500:
        return "A"
    elif teff_k >= 6000:
        return "F"
    elif teff_k >= 5200:
        return "G"
    elif teff_k >= 3700:
        return "K"
    else:
        return "M"


def temperature_to_rgb(teff_k: float) -> dict:
    """
    Convert stellar effective temperature to approximate RGB color
    for rendering the star in Three.js.
    
    Uses Tanner Helland's blackbody approximation algorithm.
    Returns dict with r, g, b values (0-255) and hex string.
    """
    temp = teff_k / 100.0

    # Red channel
    if temp <= 66:
        r = 255
    else:
        r = 329.698727446 * ((temp - 60) ** -0.1332047592)
        r = max(0, min(255, r))

    # Green channel
    if temp <= 66:
        g = 99.4708025861 * math.log(temp) - 161.1195681661
    else:
        g = 288.1221695283 * ((temp - 60) ** -0.0755148492)
    g = max(0, min(255, g))

    # Blue channel
    if temp >= 66:
        b = 255
    elif temp <= 19:
        b = 0
    else:
        b = 138.5177312231 * math.log(temp - 10) - 305.0447927307
        b = max(0, min(255, b))

    r, g, b = int(r), int(g), int(b)
    hex_color = "#{:02x}{:02x}{:02x}".format(r, g, b)
    
    return {"r": r, "g": g, "b": b, "hex": hex_color}
