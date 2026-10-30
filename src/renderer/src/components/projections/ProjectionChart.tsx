import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '../ui'
import { formatMoney } from '../../../../shared/money'
import type { Projection } from '../../../../shared/projection'
import { chartMonthLabel, chartScale, labelEvery } from '../../lib/projection'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'

const HEIGHT = 240
const PAD = { top: 20, right: 20, bottom: 28, left: 72 }

/** A point on the line: "Today", then each month's end */
interface Point {
  label: string
  /** Full name for the tooltip and screen readers */
  title: string
  cents: number
  inCents: number | null
  outCents: number | null
}

/** Month-end balance as one line from today, the zero line and the lowest point labelled */
export function ProjectionChart({ data }: { data: Projection }) {
  const { t, i18n } = useTranslation()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(320, Math.round(entries[0].contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const points: Point[] = [
    { label: t('projections.chart_today'), title: t('projections.chart_today'), cents: data.startCents, inCents: null, outCents: null },
    ...data.months.map(m => ({
      label: chartMonthLabel(m.month, i18n.language),
      title: t('projections.chart_month_end', { month: monthLabel(monthDate(m.month), i18n.language) }),
      cents: m.endCents,
      inCents: m.inCents,
      outCents: m.outCents,
    })),
  ]
  const scale = chartScale(points.map(p => p.cents))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1))
  const y = (cents: number) => PAD.top + ((scale.max - cents) * plotH) / (scale.max - scale.min)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(' ')
  const lowestIndex = 1 + data.months.findIndex(m => m.month === data.lowest.month)
  const every = labelEvery(points.length)
  const slot = plotW / Math.max(1, points.length - 1)
  const shown = active === null ? null : points[active]

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const last = points.length - 1
    setActive(i => {
      if (e.key === 'Home') return 0
      if (e.key === 'End') return last
      const from = i ?? (e.key === 'ArrowRight' ? -1 : last + 1)
      return Math.min(last, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label={t('projections.chart_label', {
          start: formatMoney(data.startCents),
          end: formatMoney(data.endCents),
          lowest: formatMoney(data.lowest.cents),
          month: monthLabel(monthDate(data.lowest.month), i18n.language),
        })}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* Gridlines and the y-axis, recessive; 0 a step stronger */}
        {scale.ticks.map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'stroke-gray-400' : 'stroke-line'} strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular-nums">
              {formatMoney(v, { whole: true })}
            </text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className={cx('text-[11px]', i === 0 ? 'fill-fg font-medium' : 'fill-fg-muted')}>
            {p.label}
          </text>
        ))}

        {/* Crosshair */}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-gray-400" strokeWidth={1} />}

        <path d={path} fill="none" className="stroke-chart-balance" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.cents)}
            r={i === active || i === lowestIndex ? 5 : 4}
            className={cx(p.cents < 0 ? 'fill-chart-negative' : 'fill-chart-balance', 'stroke-surface')}
            strokeWidth={2}
          />
        ))}

        {/* The lowest point, labelled in text ink */}
        {lowestIndex > 0 && (
          <text
            x={Math.min(Math.max(x(lowestIndex), PAD.left + 60), width - PAD.right - 60)}
            y={y(points[lowestIndex].cents) + (y(points[lowestIndex].cents) > PAD.top + 24 ? -12 : 20)}
            textAnchor="middle"
            // A surface halo keeps the label legible where it crosses the line
            paintOrder="stroke"
            strokeWidth={4}
            strokeLinejoin="round"
            className="fill-fg stroke-surface text-[11px] font-semibold tabular-nums"
          >
            {t('projections.chart_lowest', { amount: formatMoney(points[lowestIndex].cents, { whole: true }) })}
          </text>
        )}

        {/* Hit targets wider than the marks: one band per point */}
        {points.map((_, i) => (
          <rect
            key={i}
            x={x(i) - slot / 2}
            y={PAD.top}
            width={slot}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerMove={() => setActive(i)}
          />
        ))}
      </svg>

      {shown && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(active) - 88, 0), width - 184), top: 0 }}
        >
          <div className="mb-1 flex items-center gap-2 text-fg-muted">
            <span className={cx('inline-block h-0.5 w-3 rounded', shown.cents < 0 ? 'bg-chart-negative' : 'bg-chart-balance')} />
            {shown.title}
          </div>
          <div className="text-sm font-semibold tabular-nums text-fg">
            {formatMoney(shown.cents)}
            {shown.cents < 0 && <span className="ml-1 text-xs font-medium text-red-700">{t('projections.below_zero')}</span>}
          </div>
          {shown.inCents !== null && (
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 tabular-nums text-fg-muted">
              <span>{t('projections.col_in')}</span>
              <span className="text-right">{formatMoney(shown.inCents, { sign: 'exceptZero' })}</span>
              <span>{t('projections.col_out')}</span>
              <span className="text-right">{formatMoney(0 - (shown.outCents ?? 0), { sign: 'exceptZero' })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
