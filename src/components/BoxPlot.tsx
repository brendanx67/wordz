import { useMemo } from 'react'
import type { BoxStats } from '@/lib/boxStats'

// Horizontal box-and-whisker plot rendered as inline SVG. recharts (the project
// charting dep) has no native box plot, and the geometry here is simple enough
// that hand-drawn SVG gives full control over the amber theme and outlier dots.
// One row per series; a shared score axis along the bottom.

export interface BoxSeries {
  label: string
  /** Smaller line under the label, e.g. "12 games". */
  sublabel?: string
  /** Hex color for the box/whiskers/outliers. */
  color: string
  stats: BoxStats
}

interface BoxPlotProps {
  series: BoxSeries[]
}

// SVG user-space geometry. The <svg> scales to its container via viewBox.
const W = 720
const LABEL_W = 156
const ROW_H = 46
const TOP_PAD = 10
const AXIS_H = 34
const PLOT_LEFT = LABEL_W
const PLOT_RIGHT = W - 18
const BOX_H = 18
const CAP_H = 10

/** A "nice" round step (1/2/5 × 10ⁿ) near range/targetTicks. */
function niceStep(range: number, targetTicks = 5): number {
  const raw = Math.max(range, 1) / targetTicks
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

export default function BoxPlot({ series }: BoxPlotProps) {
  const { domainMax, ticks } = useMemo(() => {
    const dataMax = Math.max(
      1,
      ...series.flatMap(s => [s.stats.whiskerHigh, s.stats.max, ...s.stats.outliers]),
    )
    const step = niceStep(dataMax)
    const domainMax = Math.ceil(dataMax / step) * step
    const ticks: number[] = []
    for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t))
    return { domainMax, ticks }
  }, [series])

  const height = TOP_PAD + series.length * ROW_H + AXIS_H
  const x = (v: number) => PLOT_LEFT + (v / domainMax) * (PLOT_RIGHT - PLOT_LEFT)
  const axisY = TOP_PAD + series.length * ROW_H

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Score distribution box plot"
      >
        {/* Vertical gridlines + axis ticks */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={x(t)} y1={TOP_PAD} x2={x(t)} y2={axisY} stroke="#fbbf24" strokeOpacity={0.08} />
            <text x={x(t)} y={axisY + 18} textAnchor="middle" fontSize={11} fill="#fbbf24" fillOpacity={0.55}>
              {t}
            </text>
          </g>
        ))}
        <line x1={PLOT_LEFT} y1={axisY} x2={PLOT_RIGHT} y2={axisY} stroke="#fbbf24" strokeOpacity={0.25} />
        <text x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={axisY + 32} textAnchor="middle" fontSize={10} fill="#fbbf24" fillOpacity={0.45}>
          Score per game
        </text>

        {series.map((s, i) => {
          const yc = TOP_PAD + i * ROW_H + ROW_H / 2
          const st = s.stats
          const boxLeft = x(st.q1)
          const boxRight = x(st.q3)
          const boxW = Math.max(1, boxRight - boxLeft)
          return (
            <g key={s.label + i}>
              {/* Labels */}
              <text x={8} y={s.sublabel ? yc - 2 : yc + 4} fontSize={13} fontWeight={600} fill="#fde68a">
                {s.label}
              </text>
              {s.sublabel && (
                <text x={8} y={yc + 13} fontSize={10} fill="#fbbf24" fillOpacity={0.6}>
                  {s.sublabel}
                </text>
              )}

              {/* Whiskers */}
              <line x1={x(st.whiskerLow)} y1={yc} x2={boxLeft} y2={yc} stroke={s.color} strokeOpacity={0.8} />
              <line x1={boxRight} y1={yc} x2={x(st.whiskerHigh)} y2={yc} stroke={s.color} strokeOpacity={0.8} />
              <line x1={x(st.whiskerLow)} y1={yc - CAP_H / 2} x2={x(st.whiskerLow)} y2={yc + CAP_H / 2} stroke={s.color} strokeOpacity={0.8} />
              <line x1={x(st.whiskerHigh)} y1={yc - CAP_H / 2} x2={x(st.whiskerHigh)} y2={yc + CAP_H / 2} stroke={s.color} strokeOpacity={0.8} />

              {/* Box (interquartile range) */}
              <rect x={boxLeft} y={yc - BOX_H / 2} width={boxW} height={BOX_H} rx={2} fill={s.color} fillOpacity={0.22} stroke={s.color} strokeWidth={1.5} />

              {/* Median */}
              <line x1={x(st.median)} y1={yc - BOX_H / 2} x2={x(st.median)} y2={yc + BOX_H / 2} stroke={s.color} strokeWidth={2.5} />

              {/* Mean — hollow diamond, drawn on top */}
              <path
                d={`M ${x(st.mean)} ${yc - 5} L ${x(st.mean) + 5} ${yc} L ${x(st.mean)} ${yc + 5} L ${x(st.mean) - 5} ${yc} Z`}
                fill="#1a1208"
                stroke="#f5f5f4"
                strokeWidth={1.5}
              />

              {/* Outliers */}
              {st.outliers.map((o, oi) => (
                <circle key={oi} cx={x(o)} cy={yc} r={3} fill={s.color} fillOpacity={0.55} stroke={s.color} />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-amber-400/70">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-4 h-2.5 rounded-sm border border-amber-400/70 bg-amber-400/20" />
          middle 50% (IQR)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-0.5 h-3 bg-amber-300" />
          median
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rotate-45 border border-stone-100" />
          mean
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/60" />
          outlier
        </span>
        <span className="text-amber-500/50">whiskers: range within 1.5×IQR</span>
      </div>
    </div>
  )
}
