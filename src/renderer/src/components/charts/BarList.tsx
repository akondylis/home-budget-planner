import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { IconButton, LIST_GRID, ListCard, ListHeader, Money, cx } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { yearChange } from '../../lib/budget'

export interface BarListRow {
  key: string
  name: ReactNode
  /** Muted text after the name (the group of a category) */
  sub?: string | null
  /** Drawn before the name (a member's colour dot) */
  leading?: ReactNode
  cents: number
  share: number
  /** Same measure in the compared period; null without a comparison */
  compareCents: number | null
  /** Opens the rows behind it */
  onOpen: () => void
  /** Shown when the row is expanded (a member's top categories) */
  details?: ReactNode
}

export interface BarListProps {
  rows: BarListRow[]
  token: 'chart-income' | 'chart-expense'
  columns: { name: string; amount: string; share: string; change: string | null }
  /** Words for the change: "{amount} more than {period}" */
  changeWords: (deltaCents: number) => string
}

/**
 * Ranked horizontal bars as a table: name over its bar, amount at the tip, share and change.
 * Thin bars in one hue (dataviz: identity is the name, never the colour).
 */
export function BarList({ rows, token, columns, changeWords }: BarListProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(1, ...rows.map(r => r.cents))
  const expandable = rows.some(r => r.details)
  const cols = cx(LIST_GRID, columns.change ? 'grid-cols-[minmax(0,1fr)_8rem_4rem_10rem]' : 'grid-cols-[minmax(0,1fr)_8rem_4rem]')

  return (
    <ListCard>
      <ListHeader cols={cols}>
        <div>{columns.name}</div>
        <div className="text-right">{columns.amount}</div>
        <div className="text-right">{columns.share}</div>
        {columns.change && <div className="text-right">{columns.change}</div>}
      </ListHeader>
      {rows.map(r => (
        <div key={r.key} className="border-b border-gray-100 last:border-b-0">
          <div className={cx(cols, 'min-h-14 py-2 hover:bg-surface-hover')}>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {expandable && (
                  <IconButton
                    icon={open === r.key ? 'chevron-down' : 'chevron-right'}
                    size="sm"
                    label={t(open === r.key ? 'reports.hide_details' : 'reports.show_details')}
                    aria-expanded={open === r.key}
                    disabled={!r.details}
                    onClick={() => setOpen(open === r.key ? null : r.key)}
                  />
                )}
                {r.leading}
                <button type="button" onClick={r.onOpen} title={t('reports.open_rows')} className="truncate text-left text-sm text-fg hover:text-accent hover:underline">
                  {r.name}
                </button>
                {r.sub && <span className="truncate text-xs text-gray-500">{r.sub}</span>}
              </div>
              <div className="mt-1.5 h-2 w-full" aria-hidden="true">
                <div
                  className={cx('h-2 rounded-r', token === 'chart-income' ? 'bg-chart-income' : 'bg-chart-expense')}
                  style={{ width: `${Math.max(0.5, (Math.max(0, r.cents) * 100) / max)}%` }}
                />
              </div>
            </div>
            <div className="text-right text-sm font-medium text-fg"><Money cents={r.cents} /></div>
            <div className="text-right text-sm text-fg-muted tabular-nums">{r.share}%</div>
            {columns.change && (
              <div className="text-right text-sm">
                {r.compareCents !== null && <Change thisCents={r.cents} lastCents={r.compareCents} words={changeWords} />}
              </div>
            )}
          </div>
          {open === r.key && r.details && <div className="bg-surface-2/60 pb-2">{r.details}</div>}
        </div>
      ))}
    </ListCard>
  )
}

/** ↑ +€120 · +12 %, with the words for screen readers; colour never carries the meaning */
export function Change({ thisCents, lastCents, words }: { thisCents: number; lastCents: number; words: (deltaCents: number) => string }) {
  const { t, i18n } = useTranslation()
  const { deltaCents, percent } = yearChange(thisCents, lastCents)
  if (deltaCents === 0) return <span className="text-gray-500">{t('reports.same')}</span>
  const text = words(deltaCents)
  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums" title={text}>
      <Icon name={deltaCents > 0 ? 'arrow-up' : 'arrow-down'} size={12} className="shrink-0 text-fg-muted" />
      <span>{formatMoney(deltaCents, { sign: 'always' })}</span>
      {percent !== null && (
        <span className="text-xs text-gray-500">
          {new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'el-GR', { style: 'percent', signDisplay: 'exceptZero' }).format(percent / 100)}
        </span>
      )}
      <span className="sr-only">{text}</span>
    </span>
  )
}
