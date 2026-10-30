import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { chartScale, labelEvery } from '../../lib/chart-scale'

const HEIGHT = 240
const PAD = { top: 20, right: 20, bottom: 28, left: 72 }

export interface LinePoint {
  /** x-axis label ("Today", "Mar", "Jan 27") */
  label: string
  /** Full name for the tooltip ("End of March 2027") */
  title: string
  cents: number
  /** Extra tooltip lines under the value (in, out…) */
  details?: Array<{ label: string; cents: number }>
}

export interface LineChartProps {
  points: LinePoint[]
  /** Summary for screen readers; the page's table carries every number */
  ariaLabel: string
  /** Point given a label above it (the lowest point) */
  highlight?: { index: number; label: string } | null
  /** Shown in the tooltip after a negative value */
  belowZeroLabel: string
}

/**
 * One money series as a 2px line with ringed dots (follows the dataviz skill): recessive grid, a
 * stronger zero line, dots below zero in the negative token. Hover or arrow keys move a crosshair.
 */
export function LineChart({ points, ariaLabel, highlight, belowZeroLabel }: LineChartProps) {
  const { width, wrap } = useChartWidth()
  const [active, setActive] = useState<number | null>(null)
  const scale = chartScale(points.map(p => p.cents))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1))
  const y = (cents: number) => PAD.top + ((scale.max - cents) * plotH) / (scale.max - scale.min)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(' ')
  const every = labelEvery(points.length)
  const slot = plotW / Math.max(1, points.length - 1)
  const shown = active === null ? null : points[active]

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={e => moveWithKeys(e, points.length, setActive)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <YAxis ticks={scale.ticks} y={y} left={PAD.left} right={width - PAD.right} />
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-fg-muted text-[11px]">{p.label}</text>
        ))}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-gray-400" strokeWidth={1} />}

        <path d={path} fill="none" className="stroke-chart-balance" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.cents)}
            r={i === active || i === highlight?.index ? 5 : 4}
            className={cx(p.cents < 0 ? 'fill-chart-negative' : 'fill-chart-balance', 'stroke-surface')}
            strokeWidth={2}
          />
        ))}

        {highlight && points[highlight.index] && (
          <text
            x={Math.min(Math.max(x(highlight.index), PAD.left + 60), width - PAD.right - 60)}
            y={y(points[highlight.index].cents) + (y(points[highlight.index].cents) > PAD.top + 24 ? -12 : 20)}
            textAnchor="middle"
            // A surface halo keeps the label legible where it crosses the line
            paintOrder="stroke"
            strokeWidth={4}
            strokeLinejoin="round"
            className="fill-fg stroke-surface text-[11px] font-semibold tabular-nums"
          >
            {highlight.label}
          </text>
        )}

        {/* Hit targets wider than the marks: one band per point */}
        {points.map((_, i) => (
          <rect key={i} x={x(i) - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} onPointerMove={() => setActive(i)} />
        ))}
      </svg>

      {shown && active !== null && (
        <ChartTooltip left={x(active)} width={width} title={shown.title} keyClass={shown.cents < 0 ? 'bg-chart-negative' : 'bg-chart-balance'}>
          <div className="text-sm font-semibold tabular-nums text-fg">
            {formatMoney(shown.cents)}
            {shown.cents < 0 && <span className="ml-1 text-xs font-medium text-red-700">{belowZeroLabel}</span>}
          </div>
          {shown.details && <TooltipRows rows={shown.details} />}
        </ChartTooltip>
      )}
    </div>
  )
}

// ── Pieces shared with ColumnChart ───────────────────────────────────────────

/** The svg's width follows its card */
export function useChartWidth() {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(320, Math.round(entries[0].contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { width, wrap }
}

/** ← → Home End move the active point */
export function moveWithKeys(e: KeyboardEvent, count: number, setActive: (f: (i: number | null) => number | null) => void) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
  e.preventDefault()
  const last = count - 1
  setActive(i => {
    if (e.key === 'Home') return 0
    if (e.key === 'End') return last
    const from = i ?? (e.key === 'ArrowRight' ? -1 : last + 1)
    return Math.min(last, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
  })
}

/** Recessive gridlines with whole-euro labels; 0 a step stronger */
export function YAxis({ ticks, y, left, right }: { ticks: number[]; y: (cents: number) => number; left: number; right: number }) {
  return (
    <>
      {ticks.map(v => (
        <g key={v}>
          <line x1={left} x2={right} y1={y(v)} y2={y(v)} className={v === 0 ? 'stroke-gray-400' : 'stroke-line'} strokeWidth={1} />
          <text x={left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular-nums">
            {formatMoney(v, { whole: true })}
          </text>
        </g>
      ))}
    </>
  )
}

/** Floating readout above the chart; values lead, a line key marks the series */
export function ChartTooltip({ left, width, title, keyClass, children }: { left: number; width: number; title: string; keyClass: string | null; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: Math.min(Math.max(left - 88, 0), width - 184), top: 0 }}
    >
      <div className="mb-1 flex items-center gap-2 text-fg-muted">
        {keyClass && <span className={cx('inline-block h-0.5 w-3 rounded', keyClass)} />}
        {title}
      </div>
      {children}
    </div>
  )
}

export function TooltipRows({ rows }: { rows: Array<{ label: string; cents: number; keyClass?: string }> }) {
  return (
    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 tabular-nums text-fg-muted">
      {rows.map(r => (
        <TooltipRow key={r.label} {...r} />
      ))}
    </div>
  )
}

function TooltipRow({ label, cents, keyClass }: { label: string; cents: number; keyClass?: string }) {
  return (
    <>
      <span className="flex items-center gap-1.5">
        {keyClass && <span className={cx('inline-block h-2 w-2 rounded-sm', keyClass)} />}
        {label}
      </span>
      <span className="text-right">{formatMoney(cents, { sign: 'exceptZero' })}</span>
    </>
  )
}
