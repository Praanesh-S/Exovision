import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TransitChart from '../components/TransitChart'

interface ClassificationResult {
  koi_name: string
  classification: string
  confidence: number
  scores: {
    confirmed: number
    candidate: number
    false_positive: number
  }
  saliency: {
    global_view: number[]
    local_view: number[]
  }
  global_view: number[]
  local_view: number[]
}

const classColors: Record<string, string> = {
  CONFIRMED: '#34D399',
  CANDIDATE: '#F59E0B',
  'FALSE POSITIVE': '#F87171',
}

export default function ClassifyPage() {
  const [koiName, setKoiName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [chartView, setChartView] = useState<'global' | 'local'>('global')
  const navigate = useNavigate()

  const handleClassify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!koiName.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/classify/?koi_name=${encodeURIComponent(koiName.trim().toUpperCase())}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Target not found or not yet processed.')
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Classification failed.')
    } finally {
      setLoading(false)
    }
  }

  const scoreBars = result
    ? [
        { label: 'Confirmed Planet', value: result.scores.confirmed, color: classColors.CONFIRMED },
        { label: 'Planet Candidate', value: result.scores.candidate, color: classColors.CANDIDATE },
        { label: 'False Positive', value: result.scores.false_positive, color: classColors['FALSE POSITIVE'] },
      ]
    : []

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6 relative">
      {/* Decorative gradient orbs */}
      <div className="absolute top-1/3 -left-20 w-[400px] h-[400px] rounded-full bg-aurora/8 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/3 -right-20 w-[300px] h-[300px] rounded-full bg-cyan/8 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-4xl glass rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 min-h-[500px] relative z-10">
        
        {/* Left column: Controls and Prediction results */}
        <div className="w-full md:w-[320px] flex flex-col shrink-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight mb-2 font-display text-text-primary">Classify Transit</h1>
            <p className="text-text-secondary text-xs leading-relaxed">
              Feed Kepler Object of Interest light curve data directly into our trained 1D-CNN model.
            </p>
          </div>

          <form onSubmit={handleClassify} className="space-y-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="koi-classify-input" className="text-[10px] uppercase tracking-wider text-text-muted font-bold">
                Kepler KOI Name
              </label>
              <div className="flex gap-2">
                <input
                  id="koi-classify-input"
                  type="text"
                  value={koiName}
                  onChange={(e) => setKoiName(e.target.value)}
                  placeholder="e.g. K00001.01"
                  className="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-aurora transition-colors font-mono"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-aurora hover:bg-aurora-bright text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:bg-stardust disabled:cursor-not-allowed"
                >
                  {loading ? 'Running...' : 'Classify'}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-stellar-cool font-mono bg-stellar-cool/10 border border-stellar-cool/20 p-2.5 rounded-lg">
                ⚠️ {error}
              </p>
            )}
          </form>

          {/* Classification output display */}
          {result && (
            <div className="mt-auto space-y-5 border-t border-border pt-5 bg-surface/20 p-3 rounded-xl">
              <div>
                <span className="text-[9px] uppercase tracking-widest text-text-muted font-bold">Model Output</span>
                <h2 className="text-lg font-bold mt-1 font-mono flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: classColors[result.classification], boxShadow: `0 0 10px ${classColors[result.classification]}` }}
                  />
                  {result.classification}
                </h2>
              </div>

              {/* Confidence bars */}
              <div className="space-y-3">
                {scoreBars.map((bar) => (
                  <div key={bar.label} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-semibold text-text-secondary font-mono">
                      <span>{bar.label}</span>
                      <span>{(bar.value * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${bar.value * 100}%`, background: bar.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* 3D button */}
              <button
                onClick={() => navigate(`/system/${encodeURIComponent(result.koi_name)}`)}
                className="w-full mt-2 bg-gradient-to-r from-aurora to-cyan hover:from-aurora-bright hover:to-cyan text-white py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all duration-300 cursor-pointer shadow-lg hover:shadow-aurora/20"
              >
                🪐 Render System in 3D
              </button>
            </div>
          )}
        </div>

        {/* Right column: Light Curve Saliency Chart */}
        <div className="flex-1 flex flex-col min-w-0 glass border border-border/40 rounded-xl p-4">
          {result ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4 shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary font-mono">
                  Transit Attention Map — {result.koi_name}
                </h3>
                <div className="flex bg-surface/50 rounded-lg p-0.5 border border-border">
                  <button
                    onClick={() => setChartView('global')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      chartView === 'global' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Global Orbit
                  </button>
                  <button
                    onClick={() => setChartView('local')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      chartView === 'local' ? 'bg-aurora text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Local Zoom
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-[300px]">
                <TransitChart
                  lightCurve={{
                    global_view: result.global_view,
                    local_view: result.local_view,
                    saliency_global: result.saliency.global_view,
                    saliency_local: result.saliency.local_view,
                  }}
                  activeView={chartView}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-text-muted p-8">
              <div className="text-5xl mb-4 opacity-30">📈</div>
              <p className="text-sm">Enter a Kepler ID to classify and display the attention map.</p>
              <p className="text-xs mt-2 text-text-muted/60 max-w-xs">
                Only targets with downloaded light curve files can be run (use the catalog search to see available ones).
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
