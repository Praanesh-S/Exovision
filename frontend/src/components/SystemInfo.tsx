/**
 * SystemInfo — Glass-morphism info panels displaying star and planet data.
 *
 * Shows:
 *   - Star properties (type, temp, radius, luminosity)
 *   - Planet cards with physical parameters and classification badge
 *   - Habitable zone status
 */
import type { StarData, PlanetData, HabitableZone } from '../api'

interface SystemInfoProps {
  star: StarData
  planets: PlanetData[]
  habitableZone: HabitableZone
}

const classColors: Record<string, string> = {
  CONFIRMED: '#34D399',
  CANDIDATE: '#F59E0B',
  'FALSE POSITIVE': '#F87171',
}

function ClassBadge({ label, confidence }: { label: string; confidence: number }) {
  const color = classColors[label] || '#94a3b8'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ background: color }}
      />
      {label} · {(confidence * 100).toFixed(1)}%
    </span>
  )
}

function StatItem({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.12em] text-text-muted font-semibold font-mono">
        {label}
      </span>
      <span className="text-[13px] font-semibold text-text-primary font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span className="text-text-muted text-[11px] font-normal ml-1">{unit}</span>}
      </span>
    </div>
  )
}

export default function SystemInfo({ star, planets, habitableZone }: SystemInfoProps) {
  return (
    <div className="flex gap-4 overflow-x-auto px-6 py-4 no-scrollbar">

      {/* ── Star Card ── */}
      <div
        className="glass rounded-xl p-5 min-w-[220px] shrink-0 shadow-lg shadow-black/20 transition-all duration-300 hover:scale-[1.015] hover:shadow-xl hover:shadow-black/30"
        style={{ borderLeft: `3px solid ${star.color.hex}` }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-3.5 h-3.5 rounded-full"
            style={{ background: star.color.hex, boxShadow: `0 0 10px ${star.color.hex}80` }}
          />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary font-mono">
            Host Star
          </h3>
        </div>
        <div className="h-px bg-border/40 mb-3" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <StatItem label="Type" value={`${star.spectral_type}-type`} />
          <StatItem label="T_eff" value={star.teff_k.toFixed(0)} unit="K" />
          <StatItem label="Radius" value={star.radius_rsun.toFixed(3)} unit="R☉" />
          <StatItem label="Mass" value={star.mass_msun.toFixed(3)} unit="M☉" />
          <StatItem label="Luminosity" value={star.luminosity_lsun.toFixed(3)} unit="L☉" />
          <StatItem label="log g" value={star.surface_gravity_logg.toFixed(2)} />
        </div>
      </div>

      {/* ── Habitable Zone Card ── */}
      <div
        className="glass rounded-xl p-5 min-w-[180px] shrink-0 shadow-lg shadow-black/20 transition-all duration-300 hover:scale-[1.015] hover:shadow-xl hover:shadow-black/30"
        style={{ borderLeft: '3px solid #34D399' }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-3.5 h-3.5 rounded-full bg-habitable/30 border border-habitable/50" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-habitable font-mono">
            Habitable Zone
          </h3>
        </div>
        <div className="h-px bg-habitable/20 mb-3" />
        <div className="space-y-3">
          <StatItem
            label="Conservative"
            value={`${habitableZone.conservative.inner_au} – ${habitableZone.conservative.outer_au}`}
            unit="AU"
          />
          <StatItem
            label="Optimistic"
            value={`${habitableZone.optimistic.inner_au} – ${habitableZone.optimistic.outer_au}`}
            unit="AU"
          />
        </div>
      </div>

      {/* ── Planet Cards ── */}
      {planets.map((planet) => {
        const accentColor = classColors[planet.classification] || '#818CF8'
        return (
          <div
            key={planet.koi_name}
            className="glass rounded-xl p-5 min-w-[250px] shrink-0 shadow-lg shadow-black/20 transition-all duration-300 hover:scale-[1.015] hover:shadow-xl hover:shadow-black/30"
            style={{ borderLeft: `3px solid ${accentColor}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold text-text-primary font-mono tracking-wide">
                {planet.kepler_name || planet.koi_name}
              </h3>
              <ClassBadge label={planet.classification} confidence={planet.confidence} />
            </div>
            <div className="h-px bg-border/40 mb-3" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <StatItem label="Radius" value={planet.radius_rearth.toFixed(2)} unit="R⊕" />
              <StatItem label="Class" value={planet.size_class} />
              <StatItem label="Period" value={planet.period_days.toFixed(2)} unit="days" />
              <StatItem label="Orbit" value={planet.orbital_distance_au.toFixed(4)} unit="AU" />
              <StatItem label="T_eq" value={planet.equilibrium_temp_k.toFixed(0)} unit="K" />
              <StatItem
                label="HZ Status"
                value={planet.in_habitable_zone ? '✓ Inside' : '✗ Outside'}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
