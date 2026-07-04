/**
 * AboutPage — Project information, methodology, and real-world impact.
 *
 * Sections:
 *   - Hero tagline
 *   - What is Exovision
 *   - How It Works (vertical timeline)
 *   - Why It Matters (2×2 card grid)
 *   - Technical Stack (badge row)
 *   - Model Performance (stat cards)
 */

const STEPS = [
  {
    num: 1,
    title: 'Light Curve Acquisition',
    desc: 'Raw photometric time-series data is downloaded from NASA\'s Mikulski Archive for Space Telescopes (MAST). We ingest Kepler long-cadence observations spanning up to 17 quarters of continuous monitoring.',
    icon: '📡',
  },
  {
    num: 2,
    title: 'Phase Folding & Preprocessing',
    desc: 'Each light curve is folded at the known orbital period and median-normalized. We generate a global view (1,000 bins spanning the full orbit) and a local view (200 bins zoomed into the transit dip) to capture both broad and fine-grained transit morphology.',
    icon: '📊',
  },
  {
    num: 3,
    title: 'Neural Network Classification',
    desc: 'A dual-input 1D Convolutional Neural Network — inspired by the AstroNet architecture from Google Brain — independently processes the global and local views. The features are fused through fully-connected layers to output a three-class disposition: Confirmed Planet, Planet Candidate, or False Positive.',
    icon: '🧠',
  },
  {
    num: 4,
    title: '3D Orbital Reconstruction',
    desc: 'Physical parameters — stellar mass, radius, luminosity, planet equilibrium temperature, and orbital distance — are computed from catalog data and Kepler\'s third law. The system is then rendered as an interactive, physically-derived 3D orbital simulation using Three.js.',
    icon: '🌍',
  },
]

const IMPACT_CARDS = [
  {
    title: 'Accelerating Discovery',
    desc: 'Automates the vetting of thousands of transit signals that would take human astronomers months to manually review, dramatically speeding up the planet validation pipeline.',
    icon: '⚡',
    accent: '#6366F1',
  },
  {
    title: 'Finding Habitable Worlds',
    desc: 'Identifies planets orbiting within their star\'s habitable zone — the region where liquid water could exist on a rocky surface — a key prerequisite for life as we know it.',
    icon: '💧',
    accent: '#34D399',
  },
  {
    title: 'Democratizing Astronomy',
    desc: 'Empowers citizen scientists, students, and independent researchers to explore NASA Kepler\'s legacy dataset through an intuitive, visually rich interface without needing specialized software.',
    icon: '🔭',
    accent: '#22D3EE',
  },
  {
    title: 'Searching for Earth 2.0',
    desc: 'Contributes to humanity\'s deepest question — are we alone? By efficiently classifying exoplanet candidates, we advance the systematic search for Earth-like worlds beyond our solar system.',
    icon: '🌎',
    accent: '#F59E0B',
  },
]

const TECH_STACK = [
  { name: 'Python', color: '#3776AB' },
  { name: 'FastAPI', color: '#009688' },
  { name: 'PyTorch', color: '#EE4C2C' },
  { name: 'React', color: '#61DAFB' },
  { name: 'Three.js', color: '#000000' },
  { name: 'Recharts', color: '#8884d8' },
  { name: 'Lightkurve', color: '#F59E0B' },
  { name: 'NASA MAST', color: '#FC3D21' },
]

export default function AboutPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] relative overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-20 -left-40 w-[500px] h-[500px] rounded-full bg-aurora/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-40 -right-40 w-[400px] h-[400px] rounded-full bg-cyan/8 blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-habitable/4 blur-[150px] pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 py-16 relative z-10">

        {/* ── Hero ── */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-aurora/30 bg-aurora/5 text-[11px] text-aurora-bright font-mono tracking-widest uppercase mb-8">
            <span className="text-habitable">●</span> Project Documentation
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            About{' '}
            <span className="bg-gradient-to-r from-aurora via-aurora-bright to-cyan bg-clip-text text-transparent">
              Exovision
            </span>
          </h1>
          <p className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-sans">
            A deep learning-powered transit classification system that maps candidate exoplanets
            from NASA Kepler data into physically derived 3D orbital environments.
          </p>
        </div>

        {/* ── What is Exovision ── */}
        <section className="mb-20">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted font-mono mb-6">
            What is Exovision
          </h2>
          <div className="glass rounded-2xl p-8">
            <p className="text-text-secondary text-base leading-[1.8] font-sans">
              Exovision is an end-to-end machine learning pipeline that ingests raw photometric
              observations from the{' '}
              <span className="text-aurora-bright font-semibold">NASA Kepler Space Telescope</span>,
              preprocesses them into standardized transit representations, and classifies each signal
              using a{' '}
              <span className="text-cyan font-semibold">1D Convolutional Neural Network</span>{' '}
              inspired by Google Brain's AstroNet architecture. The system goes beyond classification —
              it computes physical stellar and planetary parameters, determines habitable zone boundaries,
              and renders each system as an{' '}
              <span className="text-habitable font-semibold">interactive 3D orbital simulation</span>.
            </p>
          </div>
        </section>

        {/* ── How It Works (Timeline) ── */}
        <section className="mb-20">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted font-mono mb-8">
            How It Works
          </h2>
          <div className="relative pl-8">
            {/* Vertical connecting line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-aurora/50 via-cyan/30 to-habitable/50" />

            {STEPS.map((step, i) => (
              <div key={step.num} className="relative mb-10 last:mb-0">
                {/* Step circle */}
                <div
                  className="absolute -left-8 top-0 w-[30px] h-[30px] rounded-full bg-cosmos border-2 border-aurora/50 flex items-center justify-center text-[11px] font-bold font-mono text-aurora-bright z-10"
                >
                  {step.num}
                </div>

                <div
                  className="glass rounded-xl p-6 ml-4 transition-all duration-300 hover:border-aurora/30 hover:shadow-lg hover:shadow-aurora/5"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">{step.icon}</span>
                    <h3 className="text-sm font-bold text-text-primary font-display tracking-tight">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-text-secondary text-[13px] leading-[1.75] font-sans">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Why It Matters ── */}
        <section className="mb-20">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted font-mono mb-8">
            Why It Matters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {IMPACT_CARDS.map((card) => (
              <div
                key={card.title}
                className="glass rounded-xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30"
                style={{ borderLeft: `3px solid ${card.accent}40` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{card.icon}</span>
                  <h3 className="text-sm font-bold text-text-primary font-display">{card.title}</h3>
                </div>
                <p className="text-text-secondary text-[13px] leading-[1.7] font-sans">{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Technical Stack ── */}
        <section className="mb-20">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted font-mono mb-8">
            Technical Stack
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="glass rounded-lg px-5 py-3 flex items-center gap-2.5 transition-all duration-200 hover:scale-105 hover:border-aurora/30"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: tech.color, boxShadow: `0 0 8px ${tech.color}60` }}
                />
                <span className="text-xs font-semibold text-text-primary font-mono tracking-wide">
                  {tech.name}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Model Performance ── */}
        <section className="mb-16">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted font-mono mb-8">
            Model Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass rounded-xl p-6 text-center transition-all duration-300 hover:scale-[1.03]" style={{ borderTop: '3px solid #34D399' }}>
              <div className="text-4xl font-bold font-display bg-gradient-to-b from-habitable to-habitable/60 bg-clip-text text-transparent mb-2">
                82%
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted font-mono mb-1">
                Precision
              </div>
              <div className="text-xs text-text-secondary font-sans">
                On confirmed planet predictions
              </div>
            </div>

            <div className="glass rounded-xl p-6 text-center transition-all duration-300 hover:scale-[1.03]" style={{ borderTop: '3px solid #6366F1' }}>
              <div className="text-4xl font-bold font-display bg-gradient-to-b from-aurora-bright to-aurora/60 bg-clip-text text-transparent mb-2">
                3,470
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted font-mono mb-1">
                Stars Trained
              </div>
              <div className="text-xs text-text-secondary font-sans">
                Balanced across 3 disposition classes
              </div>
            </div>

            <div className="glass rounded-xl p-6 text-center transition-all duration-300 hover:scale-[1.03]" style={{ borderTop: '3px solid #22D3EE' }}>
              <div className="text-4xl font-bold font-display bg-gradient-to-b from-cyan to-cyan/60 bg-clip-text text-transparent mb-2">
                9,564
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted font-mono mb-1">
                KOIs in Catalog
              </div>
              <div className="text-xs text-text-secondary font-sans">
                Searchable Kepler Objects of Interest
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
