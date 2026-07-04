import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCatalog, type CatalogEntry } from '../api'
import { Link } from 'react-router-dom'
import EarthScene from '../components/EarthScene'

const FEATURED_SYSTEMS = [
  { id: 'K00001.01', name: 'Kepler-1 b (TrES-2 b)', type: 'Hot Jupiter', desc: 'The darkest known exoplanet, reflecting less than 1% of light.', tags: ['Gas Giant', 'Scorching'] },
  { id: 'K00010.01', name: 'Kepler-8 b', type: 'Puffy Planet', desc: 'A giant gas planet with a density lower than cork.', tags: ['Low Density', 'Rapid Orbit'] },
  { id: 'K00087.01', name: 'Kepler-22 b', type: 'Habitable World', desc: 'First planet discovered orbiting inside the habitable zone of a G-type star.', tags: ['Habitable Zone', 'Super-Earth'] },
]

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      setDropdownOpen(false)
      return
    }

    const delayDebounce = setTimeout(() => {
      setIsSearching(true)
      fetchCatalog({ search: searchQuery, limit: 8 })
        .then((res) => {
          setResults(res.entries)
          setDropdownOpen(true)
          setIsSearching(false)
        })
        .catch((err) => {
          console.error(err)
          setIsSearching(false)
        })
    }, 300)

    return () => clearTimeout(delayDebounce)
  }, [searchQuery])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const match = results.find(
        (r) =>
          r.koi_name.toUpperCase() === searchQuery.toUpperCase().trim() ||
          r.kepler_name?.toUpperCase() === searchQuery.toUpperCase().trim()
      )
      const targetId = match ? match.koi_name : searchQuery.trim()
      navigate(`/system/${encodeURIComponent(targetId)}`)
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col relative overflow-hidden">

      {/* ── Hero Section ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-8 min-h-[calc(100vh-56px)]">

        {/* Full-bleed 3D Earth Canvas — fills the hero area */}
        <div className="absolute inset-0">
          <EarthScene className="w-full h-full" />
        </div>

        {/* Dark vignette edges to blend into page */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(6,6,15,0.0) 40%, rgba(6,6,15,0.55) 75%, rgba(6,6,15,0.95) 100%)
            `
          }}
        />
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(6,6,15,0.98))' }}
        />

        {/* Content sits above the 3D canvas (without isolating stacking context) */}
        <div className="relative flex flex-col items-center pointer-events-none w-full">

          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-aurora/30 bg-aurora/5 backdrop-blur text-[11px] text-aurora-bright font-mono tracking-widest uppercase mb-8 pointer-events-auto">
            <span className="text-habitable">●</span> Deep Space Transit Classifier
          </div>

          {/* Main Heading — EXOVISION with Cormorant Garamond + mix-blend-mode difference */}
          <h1
            className="select-none mb-4 leading-none text-white font-bold tracking-tight pointer-events-auto"
            style={{
              fontSize: 'clamp(5rem, 13vw, 11rem)',
              fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
              letterSpacing: '-0.02em',
              mixBlendMode: 'difference',
            }}
          >
            Exovision
          </h1>

          {/* Subheading */}
          <p className="text-text-primary text-2xl md:text-3xl font-display font-medium mb-6 tracking-tight pointer-events-auto">
            Explore new worlds.
          </p>

          {/* Description */}
          <p className="text-text-secondary text-base md:text-lg max-w-xl mx-auto leading-relaxed font-sans mb-12 backdrop-blur-sm pointer-events-auto">
            Exovision maps candidate light curves from the NASA Kepler catalog
            and reconstructs target systems in physically derived 3D orbital environments.
          </p>

          {/* Search Bar */}
          <div className="w-full max-w-2xl mx-auto relative pointer-events-auto">
            <form onSubmit={handleSubmit} className="w-full">
              <div className="relative group">
                {/* Glow behind input */}
                <div className="absolute -inset-1 bg-gradient-to-r from-aurora/20 via-aurora-bright/10 to-cyan/20 rounded-2xl blur-xl transition-opacity opacity-0 group-focus-within:opacity-100" />

                <div className="glass relative flex items-center rounded-2xl p-1.5 transition-all focus-within:border-aurora/40 shadow-2xl backdrop-blur-xl">
                  <div className="pl-4 pr-3 text-text-muted">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
                    placeholder="Search KOI target or Kepler Name (e.g. K00001)..."
                    className="flex-1 bg-transparent border-none outline-none py-3.5 text-text-primary placeholder-text-muted text-lg font-sans w-full"
                    autoComplete="off"
                  />
                  {isSearching && (
                    <div className="mr-4 w-4 h-4 border-2 border-t-aurora-bright border-border rounded-full animate-spin shrink-0" />
                  )}
                  <button
                    type="submit"
                    className="btn-primary ml-2 px-7 py-3.5 rounded-xl text-sm font-semibold"
                  >
                    Launch
                  </button>
                </div>
              </div>
            </form>

            {/* Autocomplete Dropdown */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-3 glass rounded-xl shadow-2xl max-h-80 overflow-y-auto z-50 py-2 backdrop-blur-xl">
                {results.map((e) => (
                  <button
                    key={e.koi_name}
                    onClick={() => {
                      navigate(`/system/${encodeURIComponent(e.koi_name)}`)
                      setDropdownOpen(false)
                    }}
                    className="w-full px-5 py-4 text-left hover:bg-stardust transition-colors flex items-center justify-between border-b border-border/40 last:border-b-0 cursor-pointer"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-medium text-text-primary font-mono">
                        {e.kepler_name || e.koi_name}
                      </span>
                      {e.kepler_name && (
                        <span className="text-xs text-text-muted font-mono">
                          KOI: {e.koi_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2.5 py-1 rounded font-mono font-bold uppercase tracking-wider ${
                          e.disposition === 'CONFIRMED'
                            ? 'bg-habitable/10 text-habitable border border-habitable/20'
                            : e.disposition === 'CANDIDATE'
                            ? 'bg-solar/10 text-solar border border-solar/20'
                            : 'bg-stellar-cool/10 text-stellar-cool border border-stellar-cool/20'
                        }`}
                      >
                        {e.disposition}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Featured Systems ── */}
      <div className="w-full max-w-5xl mx-auto px-6 pb-16 relative z-10">
        <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted font-mono">
            Featured Systems
          </h2>
          <span className="text-[10px] text-text-muted font-mono tracking-widest uppercase">
            1D-CNN Analyzed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURED_SYSTEMS.map((sys) => (
            <Link
              key={sys.id}
              to={`/system/${sys.id}`}
              className="group glass p-7 rounded-2xl hover:border-aurora/40 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between min-h-[220px] no-underline"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-aurora-bright font-bold">
                    {sys.type}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted group-hover:text-aurora-bright transition-colors">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3 font-display tracking-tight">
                  {sys.name}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed font-sans">
                  {sys.desc}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mt-8">
                {sys.tags.map((t) => (
                  <span key={t} className="text-[10px] px-3 py-1 rounded-full bg-aurora/5 text-aurora-bright/80 border border-aurora/15 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Cosmic Curiosities ── */}
      <div className="w-full max-w-5xl mx-auto px-6 pb-20 relative z-10">
        <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-muted font-mono">
            Cosmic Curiosities
          </h2>
          <span className="text-[10px] text-text-muted font-mono tracking-widest uppercase">
            Did You Know?
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: '🌍',
              fact: 'A year on Venus is shorter than a day on Venus. It takes 243 Earth days to rotate once but only 225 Earth days to orbit the Sun.',
              accent: '#6366F1',
            },
            {
              icon: '⚛️',
              fact: 'Neutron stars are so dense that a teaspoon of their material would weigh about 6 billion tons on Earth.',
              accent: '#22D3EE',
            },
            {
              icon: '✨',
              fact: 'There are more stars in the universe than grains of sand on all of Earth\'s beaches — roughly 70 sextillion (7 × 10²²).',
              accent: '#34D399',
            },
            {
              icon: '☀️',
              fact: 'The largest known star, UY Scuti, has a radius 1,700 times that of our Sun. If placed at the Sun\'s position, its surface would engulf Jupiter.',
              accent: '#F59E0B',
            },
            {
              icon: '🔇',
              fact: 'Sound cannot travel in space. It requires a medium like air or water to propagate, making space completely silent.',
              accent: '#a855f7',
            },
            {
              icon: '🔭',
              fact: 'NASA\'s Kepler Space Telescope discovered over 2,600 confirmed exoplanets during its 9-year mission, revolutionizing our understanding of planetary systems.',
              accent: '#93c5fd',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="glass rounded-xl p-6 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg hover:shadow-black/30 fact-card-animate"
              style={{
                borderLeft: `3px solid ${item.accent}40`,
                animationDelay: `${i * 120}ms`,
              }}
            >
              <span className="text-2xl block mb-3">{item.icon}</span>
              <p className="text-[13px] text-text-secondary leading-[1.75] font-sans">
                {item.fact}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer strip */}
      <div className="border-t border-border px-6 py-4 flex items-center justify-between text-xs text-text-muted relative z-10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-habitable opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-habitable" />
          </span>
          <span className="font-mono">MAST syncing</span>
        </div>
        <div className="flex items-center gap-6 font-mono">
          <span>Catalog: 9,564 KOIs</span>
          <span>CNN model v2.1</span>
        </div>
      </div>
    </div>
  )
}
