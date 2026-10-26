import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Popover } from './Popover'
import { cx } from './cx'

const CHIP = 'rounded-full border px-3 py-0.5 text-xs font-medium transition-colors'

export interface FilterPopoverButtonProps {
  /** Active filters, shown as `(n)` on the button */
  count: number
  onClearAll: () => void
  disabled?: boolean
  /** Popover sections */
  children: ReactNode
}

/** "Φίλτρα (n)" button opening a filter popover; changes apply live */
export function FilterPopoverButton({ count, onClearAll, disabled, children }: FilterPopoverButtonProps) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        ref={anchorRef}
        icon="filter"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="shrink-0"
      >
        {t('ui.filters')}
        {count > 0 && <span className="tabular-nums">({count})</span>}
      </Button>
      <Popover
        open={open && !disabled}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        align="end"
        className="w-max rounded-lg border border-line bg-surface p-4 shadow-lg"
      >
        <div role="dialog" aria-label={t('ui.filters')} className="space-y-4">
          {children}
          <div className="flex justify-end border-t border-line/60 pt-3">
            <Button variant="ghost" size="sm" icon="close" onClick={onClearAll} disabled={count === 0}>
              {t('ui.filter_clear_all')}
            </Button>
          </div>
        </div>
      </Popover>
    </>
  )
}

export interface FilterSectionProps {
  label: string
  children: ReactNode
}

/** Titled group inside a filter popover */
export function FilterSection({ label, children }: FilterSectionProps) {
  return (
    <section className="space-y-2">
      <div className="section-label">{label}</div>
      {children}
    </section>
  )
}

export interface FilterChipProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

/** Multi-select toggle chip */
export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        CHIP,
        'inline-flex items-center gap-1.5',
        active ? 'border-blue-600 bg-blue-600 text-white' : 'border-line bg-surface text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

export interface ActiveFilterPill {
  key: string
  label: string
  onRemove: () => void
}

export interface ActiveFilterPillsProps {
  pills: ActiveFilterPill[]
  onClearAll: () => void
}

/** Removable pills for each active filter, plus Clear all; renders nothing when no filter is set */
export function ActiveFilterPills({ pills, onClearAll }: ActiveFilterPillsProps) {
  const { t } = useTranslation()
  if (pills.length === 0) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {pills.map(pill => (
        <span key={pill.key} className={cx(CHIP, 'inline-flex items-center gap-1 border-line bg-surface-2 py-0 pr-0.5 text-fg')}>
          {pill.label}
          <IconButton
            icon="close"
            size="sm"
            label={t('ui.filter_remove', { label: pill.label })}
            onClick={pill.onRemove}
          />
        </span>
      ))}
      <Button variant="ghost" size="sm" icon="close" onClick={onClearAll}>
        {t('ui.filter_clear_all')}
      </Button>
    </div>
  )
}
