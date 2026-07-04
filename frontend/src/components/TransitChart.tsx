/**
 * TransitChart — Phase-folded light curve with saliency overlay.
 *
 * Shows two views:
 *   - Global view (1000 bins): Full orbital phase [-0.5, +0.5]
 *   - Local view (200 bins): Zoomed transit dip region
 *
 * The saliency gradient (cyan overlay) shows which regions the CNN focused on.
 */
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { LightCurveData } from '../api'

interface TransitChartProps {
  lightCurve: LightCurveData
  activeView: 'global' | 'local'
}

export default function TransitChart({ lightCurve, activeView }: TransitChartProps) {
  const isGlobal = activeView === 'global'
  const flux = isGlobal ? lightCurve.global_view : lightCurve.local_view
  const saliency = isGlobal ? lightCurve.saliency_global : lightCurve.saliency_local
  const bins = flux.length

  // Build chart data: phase on x, normalized flux on y, saliency as overlay
  const data = flux.map((f, i) => {
    const phase = isGlobal
      ? -0.5 + (i / (bins - 1))
      : -0.5 + (i / (bins - 1)) // Local uses same range but zoomed
    return {
      phase: +phase.toFixed(4),
      flux: +f.toFixed(6),
      saliency: +(saliency[i] * 0.3).toFixed(4), // Scale saliency for overlay
    }
  })

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="saliencyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fluxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#818CF8" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(30, 30, 64, 0.4)"
          vertical={false}
        />
        <XAxis
          dataKey="phase"
          tick={{ fill: '#555570', fontSize: 10 }}
          axisLine={{ stroke: '#1E1E40' }}
          tickLine={false}
          label={{
            value: 'Orbital Phase',
            position: 'insideBottom',
            offset: -2,
            style: { fill: '#555570', fontSize: 10 },
          }}
        />
        <YAxis
          tick={{ fill: '#555570', fontSize: 10 }}
          axisLine={{ stroke: '#1E1E40' }}
          tickLine={false}
          label={{
            value: 'Flux',
            angle: -90,
            position: 'insideLeft',
            offset: 10,
            style: { fill: '#555570', fontSize: 10 },
          }}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(11, 11, 26, 0.95)',
            border: '1px solid #1E1E40',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#F0F0F5',
          }}
          formatter={(val: any, name: any) => [
            Number(val).toFixed(4),
            name === 'flux' ? 'Flux' : 'CNN Attention',
          ]}
          labelFormatter={(label) => `Phase: ${label}`}
        />
        <ReferenceLine x={0} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.5} />
        {/* Saliency area (CNN attention) */}
        <Area
          type="monotone"
          dataKey="saliency"
          stroke="none"
          fill="url(#saliencyGrad)"
          isAnimationActive={false}
        />
        {/* Flux line */}
        <Area
          type="monotone"
          dataKey="flux"
          stroke="#818CF8"
          strokeWidth={1.5}
          fill="url(#fluxGrad)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
