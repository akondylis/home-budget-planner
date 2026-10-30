import { useState } from 'react'
import { cx } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { chartScale, labelEvery } from '../../lib/chart-scale'
import { ChartTooltip, TooltipRows, YAxis, moveWithKeys, useChartWidth } from './LineChart'

const HEIGHT = 240
const PAD = { top: 24, right: 16, bottom: 28, left: 72 }
/** Thin marks: a column never wider than this, and a 2px surface gap between neighbours */
const MAX_BAR = 24
const GAP = 2

export interface ColumnSeries {
  label: string
  /** Tailwind fill/bg classes of the series token, e.g. 'chart-income' */
  token: 'chart-income' | 'chart-expense'
}

export interface ColumnGroup {
  label: string
  title: string
  /** One positive value per series, same order */
  values: number[]
  /** Extra tooltip lines (net…) */
  details?: Array<{ label: string; cents: number }>
}

export interface ColumnChartProps {
  series: ColumnSeries[]
  groups: ColumnGroup[]
  ariaLabel: string
  onSelect?: (index: number) => void
}

/** A column with a 4px rounded data end, square at the baseline */
function columnPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, Math.max(0, base - y))
  return `M${x},${base} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${base} Z`
}

/** Grouped columns on one axis, a legend above, values on the last group, a crosshair tooltip on every group */
export function ColumnChart({ series, groups, ariaLabel, onSelect }: ColumnChartProps) {
  const { width, wrap } = useChartWidth()
  const [active, setActive] = useState<number | null>(null)
  const scale = chartScale(groups.flatMap(g => g.values))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, groups.length)
  const bar = Math.max(2, Math.min(MAX_BAR, (band * 0.7 - GAP * (series.length - 1)) / series.length))
  const y = (cents: number) => PAD.top + ((scale.max - cents) * plotH) / (scale.max - scale.min)
  const base = y(0)
  const every = labelEvery(groups.length)
  const shown = active === null ? null : groups[active]
  const last = groups.length - 1

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-fg-muted" aria-hidden="true">
        {series.map(s => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={cx('inline-block h-2.5 w-2.5 rounded-sm', s.token === 'chart-income' ? 'bg-chart-income' : 'bg-chart-expense')} />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={wrap} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          tabIndex={0}
          aria-label={ariaLabel}
          onKeyDown={e => {
            if (e.key === 'Enter' && active !== null) onSelect?.(active)
            else moveWithKeys(e, groups.length, setActive)
          }}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <YAxis ticks={scale.ticks} y={y} left={PAD.left} right={width - PAD.right} />
          {groups.map((g, i) => {
            const groupW = series.length * bar + (series.length - 1) * GAP
            const x0 = PAD.left + i * band + (band - groupW) / 2
            return (
              <g key={i} className={cx(active !== null && active !== i && 'opacity-60')}>
                {g.values.map((v, k) => {
                  const x = x0 + k * (bar + GAP)
                  return (
                    <g key={k}>
                      <path d={columnPath(x, y(v), bar, base)} className={series[k].token === 'chart-income' ? 'fill-chart-income' : 'fill-chart-expense'} />
                      {i === last && v > 0 && (
                        <text x={x + bar / 2} y={y(v) - 4} textAnchor="middle" className="fill-fg-muted text-[10px] tabular-nums">
                          {formatMoney(v, { whole: true })}
                        </text>
                      )}
                    </g>
                  )
                })}
                {(i % every === 0 || i === last) && (
                  <text x={PAD.left + i * band + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-fg-muted text-[11px]">{g.label}</text>
                )}
              </g>
            )
          })}
          {active !== null && (
            <line x1={PAD.left + active * band + band / 2} x2={PAD.left + active * band + band / 2} y1={PAD.top} y2={base} className="stroke-gray-400" strokeWidth={1} />
          )}
          {/* The whole band is the hit target */}
          {groups.map((_, i) => (
            <rect
              key={i}
              x={PAD.left + i * band}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              className={onSelect ? 'cursor-pointer' : undefined}
              onPointerEnter={() => setActive(i)}
              onPointerMove={() => setActive(i)}
              onClick={() => onSelect?.(i)}
            />
          ))}
        </svg>
        {shown && active !== null && (
          <ChartTooltip left={PAD.left + active * band + band / 2} width={width} title={shown.title} keyClass={null}>
            <TooltipRows
              rows={[
                ...series.map((s, k) => ({ label: s.label, cents: s.token === 'chart-expense' ? 0 - shown.values[k] : shown.values[k], keyClass: s.token === 'chart-income' ? 'bg-chart-income' : 'bg-chart-expense' })),
                ...(shown.details ?? []),
              ]}
            />
          </ChartTooltip>
        )}
      </div>
    </div>
  )
}
