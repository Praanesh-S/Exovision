import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { fetchSystem, type SystemResponse } from '../api'
import OrbitalScene from '../components/OrbitalScene'
import TransitChart from '../components/TransitChart'
import SystemInfo from '../components/SystemInfo'

export default function SystemView() {
  const { id } = useParams<{ id: string }>()
  const [system, setSystem] = useState<SystemResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeChartTab, setActiveChartTab] = useState<'global' | 'local'>('global')
  const [isPlaying, setIsPlaying] = useState(true)
  const [animationTime, setAnimationTime] = useState(0)
  const [chartExpanded, setChartExpanded] = useState(false)
  const [isCanvasExpanded, setIsCanvasExpanded] = useState(false)

  // Close expanded chart or canvas on Escape key
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setChartExpanded(false)
      setIsCanvasExpanded(false)
    }
  }, [])

  useEffect(() => {
    if (chartExpanded || isCanvasExpanded) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [chartExpanded, isCanvasExpanded, handleEscape])

  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(performance.now())

  // Load system data
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    
    fetchSystem(id)
      .then((data) => {
        setSystem(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch system data')
        setLoading(false)
      })
  }, [id])

  // Animation loop for orbiting planets
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      return
    }

    const animate = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now
      
      setAnimationTime((prev) => prev + delta)
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="w-12 h-12 border-4 border-t-aurora border-border rounded-full animate-spin mb-4" />
        <p className="text-text-secondary text-sm font-mono tracking-widest uppercase">Analyzing MAST light curves...</p>
      </div>
    )
  }

  if (error || !system) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold mb-2 font-display">Error Loading System</h1>
        <p className="text-stellar-cool text-sm max-w-md mb-6">{error || 'System not found'}</p>
        <Link to="/" className="btn-primary">
          Return Home
        </Link>
      </div>
    )
  }

  const primaryPlanet = system.planets.find(p => p.koi_name === id) || system.planets[0]

  // Compute stats for the summary block
  const totalPlanets = system.planets.length
  const confirmedPlanets = system.planets.filter(p => p.classification === 'CONFIRMED').length
  const candidatePlanets = system.planets.filter(p => p.classification === 'CANDIDATE').length
  const fpPlanets = system.planets.filter(p => p.classification === 'FALSE POSITIVE').length
  const habitablePlanets = system.planets.filter(p => p.in_habitable_zone)
  const isAnyHabitable = habitablePlanets.length > 0

  // Find closest planet to habitable temperature (approx. 273K)
  const closestToHabitable = [...system.planets].sort((a, b) => 
    Math.abs(a.equilibrium_temp_k - 273) - Math.abs(b.equilibrium_temp_k - 273)
  )[0]

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Top Header / Stats Bar */}
      <div className="px-6 py-3 glass border-b border-border flex flex-wrap items-center justify-between gap-4 z-10 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-text-primary font-mono">
              {primaryPlanet?.kepler_name || primaryPlanet?.koi_name} System
            </h1>
            {primaryPlanet?.kepler_name && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stardust text-text-secondary border border-border">
                KOI: {primaryPlanet.koi_name}
              </span>
            )}
          </div>
          <p className="text-text-secondary text-xs mt-0.5">
            3D orbital reconstruction map based on deep learning transit dispositions
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="btn-ghost flex items-center gap-2 text-xs font-semibold"
          >
            {isPlaying ? '⏸ Pause Orbit' : '▶ Resume Orbit'}
          </button>
          <Link
            to="/"
            className="text-xs text-aurora-bright hover:underline font-semibold no-underline"
          >
            ← Back to Catalog
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row relative">
        
        {/* Left Side: 3D Canvas + SystemInfo */}
        <div className="flex-1 flex flex-col min-h-[35vh] md:min-h-0">
          <div className={`flex-1 ${isCanvasExpanded ? 'fixed inset-0 z-50 bg-[#06060F]' : 'relative'}`}>
          {/* Subtle scale description overlay */}
          <div className="absolute top-4 left-4 pointer-events-none z-10 glass rounded-lg px-3 py-1.5 text-[10px] text-text-secondary border border-border/40 bg-cosmos/30">
            🔭 Scale: Distances adjusted logarithmically for visual clarity.
          </div>

          {/* Fullscreen / Minimize 3D Canvas Button */}
          <button
            onClick={() => setIsCanvasExpanded(!isCanvasExpanded)}
            className="absolute top-4 right-4 z-10 glass rounded-lg px-3 py-1.5 text-[10px] text-text-secondary border border-border/40 bg-cosmos/30 hover:bg-surface hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1.5 pointer-events-auto"
          >
            {isCanvasExpanded ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="10" y1="14" x2="3" y2="21" />
                </svg>
                Exit Fullscreen
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                Fullscreen
              </>
            )}
          </button>

          <Canvas camera={{ position: [0, 12, 18], fov: 42 }} className="w-full h-full">
            <OrbitalScene
              star={system.star}
              planets={system.planets}
              habitableZone={system.habitable_zone}
              animationTime={animationTime}
            />
          </Canvas>

          {/* Floating legend overlay */}
          <div className="absolute bottom-4 left-4 pointer-events-none flex flex-col gap-1.5 p-3 glass rounded-xl text-[10px] text-text-secondary border border-border/40 bg-cosmos/30">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-habitable opacity-20 border border-habitable" />
              <span>Habitable Zone (Conservative)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: system.star.color.hex }} />
              <span>Host Star ({system.star.spectral_type}-type)</span>
            </div>
            {system.planets.map((p) => (
              <div key={p.koi_name} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-aurora-bright" />
                <span className="font-mono">{p.kepler_name || p.koi_name} ({p.size_class})</span>
              </div>
            ))}
          </div>
        </div>
          
          {/* Bottom info panel (Star and Planet parameter sheets) */}
          {!isCanvasExpanded && (
            <div className="border-t border-border bg-cosmos/80 shrink-0">
              <SystemInfo
                star={system.star}
                planets={system.planets}
                habitableZone={system.habitable_zone}
              />
            </div>
          )}
        </div>

        {/* Right Side Column: Summary & Transit Graph */}
        {!isCanvasExpanded && (
          <div className="w-full md:w-[450px] shrink-0 border-t md:border-t-0 md:border-l border-border glass flex flex-col min-h-0 h-full overflow-y-auto no-scrollbar">
          
          {/* Habitability & Classification Summary Widget */}
          <div className="p-4 border-b border-border bg-cosmos/30 shrink-0">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted font-mono mb-3">
              Stellar System Summary
            </h3>
            
            {/* Dynamic Summary Text Block */}
            <div className="glass rounded-xl p-4 border-aurora/20 bg-aurora/5 mb-4">
              <p className="text-xs text-text-primary leading-relaxed">
                This system contains <strong className="text-text-primary font-mono">{totalPlanets} candidate world(s)</strong> orbiting 
                a <strong className="text-text-primary">{system.star.spectral_type}-type star</strong>. 
                Our neural network classifies <strong className="text-habitable font-mono">{confirmedPlanets}</strong> as confirmed planet(s), 
                <strong className="text-solar font-mono">{candidatePlanets}</strong> as unconfirmed planet candidate(s), and 
                <strong className="text-stellar-cool font-mono">{fpPlanets}</strong> as false positive(s) (eclipsing binary or stellar spot).
              </p>
              <div className="h-px bg-border/40 my-3" />
              <p className="text-xs text-text-secondary leading-relaxed">
                {isAnyHabitable ? (
                  <span>
                    🎉 <strong className="text-habitable font-bold">{habitablePlanets.map(p => p.kepler_name || p.koi_name).join(', ')}</strong> orbits 
                    within the star's habitable zone (conservative bounds: {system.habitable_zone.conservative.inner_au} – {system.habitable_zone.conservative.outer_au} AU). 
                    Liquid water could potentially accumulate on its surface.
                  </span>
                ) : (
                  <span>
                    ⚠️ None of the detected planets orbit within the star's habitable zone ({system.habitable_zone.conservative.inner_au} – {system.habitable_zone.conservative.outer_au} AU). 
                    All orbits are currently too close or too far. The planet closest to temperate conditions is <strong>{closestToHabitable.kepler_name || closestToHabitable.koi_name}</strong> with 
                    an equilibrium temperature of <strong>{closestToHabitable.equilibrium_temp_k} K</strong> ({Math.round(closestToHabitable.equilibrium_temp_k - 273.15)}°C).
                  </span>
                )}
              </p>
            </div>

            {/* Quick Status Badges list */}
            <div className="space-y-2">
              {system.planets.map((planet) => {
                const isConfirmed = planet.classification === 'CONFIRMED'
                const isFP = planet.classification === 'FALSE POSITIVE'
                const isHab = planet.in_habitable_zone
                return (
                  <div key={planet.koi_name} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface/50 border border-border/30">
                    <span className="font-semibold text-text-primary font-mono">
                      {planet.kepler_name || planet.koi_name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        isConfirmed 
                          ? 'bg-habitable/15 text-habitable border border-habitable/20'
                          : isFP
                          ? 'bg-stellar-cool/15 text-stellar-cool border border-stellar-cool/20'
                          : 'bg-solar/15 text-solar border border-solar/20'
                      }`}>
                        {planet.classification}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        isHab 
                          ? 'bg-habitable/25 text-habitable border border-habitable/40'
                          : 'bg-surface text-text-muted border border-border/40'
                      }`}>
                        {isHab ? '🟢 Habitable' : '🔴 Uninhabitable'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom Side: Transit Light Curve & Saliency Analysis */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-cosmos/30 shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <span>📈</span> Light Curve & Attention Map
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex bg-surface/50 rounded-lg p-0.5 border border-border">
                  <button
                    onClick={() => setActiveChartTab('global')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      activeChartTab === 'global' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Global View
                  </button>
                  <button
                    onClick={() => setActiveChartTab('local')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      activeChartTab === 'local' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Local Transit
                  </button>
                </div>
                <button
                  onClick={() => setChartExpanded(true)}
                  className="px-2.5 py-1 rounded border border-border bg-surface/30 text-[10px] text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer flex items-center gap-1"
                  title="Expand Chart"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                  Expand
                </button>
              </div>
            </div>

            {/* Chart Wrapper — Click to expand */}
            <div
              className="flex-1 min-h-[160px] p-4 relative cursor-pointer group/chart"
              onClick={() => setChartExpanded(true)}
            >
              <TransitChart lightCurve={system.light_curve} activeView={activeChartTab} />
              {/* Expand hint */}
              <div className="absolute top-6 right-6 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cosmos/80 border border-border/50 text-[10px] text-text-muted font-mono opacity-0 group-hover/chart:opacity-100 transition-opacity duration-300 pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                Click to expand
              </div>
            </div>

            {/* Explanatory notes */}
            <div className="p-4 border-t border-border bg-cosmos/40 shrink-0">
              <div className="flex items-start gap-2.5">
                <span className="text-sm">💡</span>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  The <span className="text-aurora-bright font-semibold">indigo line</span> represents the phase-folded light curve. 
                  The <span className="text-cyan font-semibold">cyan overlay</span> highlights the regions where our 
                  1D-CNN model focused its attention (Gradient Saliency map) to make its disposition prediction.
                </p>
              </div>
            </div>
          </div>

        </div>
        )}
      </div>



      {/* ── Expanded Chart Modal ── */}
      {chartExpanded && system && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center chart-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setChartExpanded(false) }}
        >
          <div className="chart-modal-content glass rounded-2xl shadow-2xl shadow-black/50 w-[92vw] max-w-[1400px] flex flex-col" style={{ maxHeight: '85vh' }}>
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary font-mono flex items-center gap-2">
                <span>📈</span> Light Curve & CNN Attention Map
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex bg-surface/50 rounded-lg p-0.5 border border-border">
                  <button
                    onClick={() => setActiveChartTab('global')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      activeChartTab === 'global' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Global View
                  </button>
                  <button
                    onClick={() => setActiveChartTab('local')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      activeChartTab === 'local' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Local Transit
                  </button>
                </div>
                <button
                  onClick={() => setChartExpanded(false)}
                  className="w-8 h-8 rounded-lg border border-border bg-surface/50 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface hover:border-border-hover transition-colors cursor-pointer"
                  aria-label="Close expanded chart"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Expanded Chart Area */}
            <div className="flex-1 min-h-0 p-6" style={{ height: '60vh' }}>
              <TransitChart lightCurve={system.light_curve} activeView={activeChartTab} />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-cosmos/40 shrink-0">
              <div className="flex items-start gap-2.5">
                <span className="text-sm">💡</span>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  The <span className="text-aurora-bright font-semibold">indigo line</span> represents the phase-folded light curve. 
                  The <span className="text-cyan font-semibold">cyan overlay</span> highlights the regions where our 
                  1D-CNN model focused its attention (Gradient Saliency map) to make its disposition prediction.
                  Press <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono mx-0.5">Esc</kbd> or click outside to close.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
