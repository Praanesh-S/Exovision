"""
Exovision — Light Curve Preprocessing Pipeline
==============================================
Implements the scientific steps to clean, detrend, fold, and bin raw transit
light curves. This pipeline transforms raw, unevenly sampled time-series data
into standardized, fixed-length global (1000 bins) and local (200 bins) views.

Key algorithms implemented:
  1. Sigma-clipping outlier removal (rejects cosmic rays and stellar flares)
  2. Savitzky-Golay filtering (detrends slow stellar variation and instrumental drift)
  3. Phase-folding (wraps time-series around the orbital period, centering transit at phase 0)
  4. Median binning (standardizes the size of the inputs to the 1D-CNN)
"""

import numpy as np
from scipy.signal import savgol_filter
from scipy.interpolate import interp1d


class TransitPreprocessor:
    """
    Handles all time-series preprocessing steps required to prepare raw Kepler/TESS
    light curves for ingestion by the deep learning classifier.
    """

    def __init__(self, global_bins: int = 1000, local_bins: int = 200):
        self.global_bins = global_bins
        self.local_bins = local_bins

    def clean_outliers(
        self, 
        time: np.ndarray, 
        flux: np.ndarray, 
        window_size: int = 201, 
        low_sigma: float = 5.0, 
        high_sigma: float = 3.0
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Remove extreme outlier points (e.g. cosmic rays, flares) using a rolling median.

        Since transit dips are negative, we are asymmetric:
          - Reject positive spikes above +3 sigma (high_sigma)
          - Reject negative drops below -5 sigma (low_sigma) to avoid clipping real transits
        """
        # Calculate rolling median to establish local baseline
        # Use edge padding to handle boundaries
        pad_size = window_size // 2
        flux_padded = np.pad(flux, pad_size, mode='edge')
        
        # Calculate running median
        rolling_median = np.median(
            np.lib.stride_tricks.sliding_window_view(flux_padded, window_size), 
            axis=1
        )
        
        # Calculate absolute deviation from median
        deviations = flux - rolling_median
        mad = np.median(np.abs(deviations))
        
        # Estimate standard deviation (1.4826 * MAD for normal distribution)
        std_est = 1.4826 * mad
        if std_est == 0:
            std_est = 1e-6

        # Mask outliers
        mask = (deviations < (high_sigma * std_est)) & (deviations > (-low_sigma * std_est))
        
        return time[mask], flux[mask]

    def detrend_light_curve(
        self, 
        time: np.ndarray, 
        flux: np.ndarray, 
        window_length_days: float = 2.0
    ) -> np.ndarray:
        """
        Flatten the light curve baseline by removing low-frequency stellar variability
        and spacecraft drift using a Savitzky-Golay polynomial filter.
        
        window_length_days: filter window size. 2 days is standard to preserve transit shapes
        (transit durations are typically a few hours).
        """
        # Estimate mean cadence (time interval between consecutive points)
        # Kepler long-cadence is ~30 minutes (0.0204 days)
        cadences = np.diff(time)
        mean_cadence = np.median(cadences)
        
        # Window size in units of datapoints (must be odd)
        window_size = int(window_length_days / mean_cadence)
        if window_size % 2 == 0:
            window_size += 1
            
        # Ensure window size is within valid bounds
        if window_size >= len(flux):
            window_size = len(flux) - 1
            if window_size % 2 == 0:
                window_size -= 1
        
        if window_size < 5:
            # Fallback if time-series is too short
            return flux / np.median(flux)

        # Apply Savitzky-Golay filter to fit a 2nd-degree polynomial local baseline
        smoothed = savgol_filter(flux, window_length=window_size, polyorder=2)
        
        # Divide by smoothed baseline to normalize (flatten)
        flattened_flux = flux / smoothed
        return flattened_flux

    def phase_fold(self, time: np.ndarray, period: float, epoch_t0: float) -> np.ndarray:
        """
        Fold the time series around the planet's orbital period.
        Phase ranges from -0.5 to +0.5, with the transit centered exactly at 0.0.
        """
        # Calculate phase relative to epoch T0
        # Phase wrapped to range [0, 1)
        phase = ((time - epoch_t0) % period) / period
        
        # Shift phase range to [-0.5, 0.5) so transit is centered at 0.0
        phase = np.where(phase >= 0.5, phase - 1.0, phase)
        return phase

    def bin_light_curve(
        self, 
        phases: np.ndarray, 
        fluxes: np.ndarray, 
        num_bins: int, 
        phase_range: tuple[float, float] = (-0.5, 0.5)
    ) -> np.ndarray:
        """
        Resample unevenly spaced phase-folded data into fixed-size bins using median binning.
        Fills any empty bins using linear interpolation.
        """
        bin_edges = np.linspace(phase_range[0], phase_range[1], num_bins + 1)
        binned_flux = np.zeros(num_bins)
        
        # Find which bin index each phase falls into
        bin_indices = np.digitize(phases, bin_edges) - 1
        
        # Compute median flux for each bin
        for i in range(num_bins):
            mask = (bin_indices == i)
            if np.any(mask):
                binned_flux[i] = np.median(fluxes[mask])
            else:
                binned_flux[i] = np.nan  # Mark empty bins for interpolation
                
        # Interpolate empty bins (if any gaps exist due to observational gaps)
        nans = np.isnan(binned_flux)
        if np.any(nans):
            x = np.flatnonzero(~nans)
            xp = np.flatnonzero(nans)
            
            if len(x) > 0:
                # Interpolate using non-nan values
                interpolator = interp1d(x, binned_flux[~nans], kind='linear', fill_value="extrapolate")
                binned_flux[nans] = interpolator(xp)
            else:
                # Fallback if entire array is nan (should not happen with actual data)
                binned_flux.fill(0.0)
                
        return binned_flux

    def generate_views(
        self, 
        time: np.ndarray, 
        flux: np.ndarray, 
        period: float, 
        epoch_t0: float, 
        duration_hours: float
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Perform complete preprocessing and generate the two views (AstroNet-style):
          - Global view: entire phase-folded orbit (1,000 bins, scaled to std=1)
          - Local view: zoomed transit region (200 bins, scaled to min_flux=-1.0)
        """
        # 1. Clean outliers
        t_clean, f_clean = self.clean_outliers(time, flux)
        
        # 2. Detrend (Flatten)
        f_flat = self.detrend_light_curve(t_clean, f_clean)
        
        # 3. Phase fold
        phases = self.phase_fold(t_clean, period, epoch_t0)
        
        # Sort by phase for clean binning
        sort_idx = np.argsort(phases)
        phases_sorted = phases[sort_idx]
        flux_sorted = f_flat[sort_idx]
        
        # 4. Generate Global View (Full phase range [-0.5, 0.5])
        global_view = self.bin_light_curve(phases_sorted, flux_sorted, self.global_bins)
        
        # Normalize Global View: baseline at median=0.0, standard deviation=1.0
        global_view = (global_view - np.median(global_view)) / (np.std(global_view) + 1e-6)
        
        # 5. Generate Local View (Zoomed in on transit, window size = 4 * duration)
        # Convert duration to phase units
        period_hours = period * 24.0
        duration_phase = duration_hours / period_hours
        
        # Define local window around phase 0.0: +/- 4 * duration_phase
        local_half_width = 4.0 * duration_phase
        # Clamp width to maximum 0.25 (to prevent overlapping half of the orbit)
        local_half_width = min(local_half_width, 0.25)
        # Fallback if duration is missing/invalid
        if np.isnan(local_half_width) or local_half_width <= 0:
            local_half_width = 0.05
            
        local_range = (-local_half_width, local_half_width)
        
        # Filter datapoints that fall inside the local transit window
        local_mask = (phases_sorted >= local_range[0]) & (phases_sorted <= local_range[1])
        
        # Resample local transit region to 200 bins
        if np.sum(local_mask) > 10:
            local_view = self.bin_light_curve(
                phases_sorted[local_mask], 
                flux_sorted[local_mask], 
                self.local_bins, 
                phase_range=local_range
            )
        else:
            # Fallback if no datapoints are inside the window (e.g. data gap exactly at transit)
            local_view = np.zeros(self.local_bins)
            
        # Normalize Local View: Baseline at 0.0, minimum of transit dip at -1.0
        # Subtract median (baseline)
        local_view = local_view - np.median(local_view)
        # Find minimum dip
        min_val = np.min(local_view)
        if min_val < 0:
            local_view = local_view / (-min_val)
        else:
            # Avoid division by zero if transit is flat / not visible
            local_view = np.zeros_like(local_view)
            
        return global_view, local_view
