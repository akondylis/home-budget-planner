import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { cx } from './cx'
import { middleClickProps, type OpenOpts } from '../../lib/middle-click'

/** Base for list grids; append a literal `grid-cols-[…]` per screen */
export const LIST_GRID = 'grid items-center gap-x-3 px-3'

/** Compact single-line `<tr>` for data tables (stats, clubs); numeric cells go `text-right tabular-nums` */
export const TABLE_ROW = 'h-12 border-b border-line/60 transition-colors duration-150 hover:bg-surface-hover'

export interface ListCardProps {
  className?: string
  children: ReactNode
}

export function ListCard({ className, children }: ListCardProps) {
  return <div className={cx('card', className)}>{children}</div>
}

export interface ListHeaderProps {
  /** Same grid classes as the rows so the columns line up */
  cols: string
  children: ReactNode
}

export function ListHeader({ cols, children }: ListHeaderProps) {
  return (
    <div className={cx(cols, 'table-header sticky top-0 z-10 h-9 rounded-t-xl border-b border-line bg-surface')}>
      {children}
    </div>
  )
}

export interface SortHeaderProps {
  /** null when the list is sorted by another column */
  direction: 'asc' | 'desc' | null
  onSort: () => void
  align?: 'left' | 'center' | 'right'
  /** 'th' inside a `<table>`; a grid cell (`div`) in a `ListHeader` otherwise */
  as?: 'div' | 'th'
  /** Hover hint for the column (e.g. how it is calculated) */
  hint?: string
  className?: string
  children: string
}

/** Clickable column label in a `ListHeader` or table head; the sorted column shows its direction */
export function SortHeader({ direction, onSort, align = 'left', as: Cell = 'div', hint, className, children }: SortHeaderProps) {
  const { t } = useTranslation()
  const directionLabel = direction === 'asc' ? t('ui.sort_asc') : t('ui.sort_desc')
  return (
    <Cell
      role={Cell === 'div' ? 'columnheader' : undefined}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      className={cx('min-w-0', align === 'center' && 'text-center', align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={onSort}
        title={hint ? `${hint}\n${directionLabel}` : directionLabel}
        aria-label={`${children} ${directionLabel}`}
        className={cx(
          'table-header inline-flex max-w-full items-center whitespace-nowrap transition-colors hover:text-fg',
          direction && 'text-fg',
        )}
      >
        <span className="truncate">{children}</span>
        {/* Rendered only on the sorted column so idle headers keep their true alignment */}
        {direction && (
          <Icon
            name="chevron-down"
            size={12}
            className={cx('ml-1 shrink-0 transition-transform', direction === 'asc' && 'rotate-180')}
          />
        )}
      </button>
    </Cell>
  )
}

export interface ListRowProps {
  cols: string
  striped?: boolean
  /** Marks the row just created or edited, so the eye finds it */
  highlighted?: boolean
  /** Makes the whole row clickable; keep a keyboard-reachable action in the row too.
      A middle-click passes `{ background: true }` */
  onOpen?: (opts?: OpenOpts) => void
  /** Cells, one per column */
  children: ReactNode
  /** Rendered under the row across all columns */
  expansion?: ReactNode
}

export function ListRow({ cols, striped = false, highlighted = false, onOpen, children, expansion }: ListRowProps) {
  return (
    <div
      data-highlighted={highlighted || undefined}
      className={cx('group border-b border-gray-100 last:rounded-b-xl last:border-b-0', striped && 'bg-gray-50', highlighted && 'bg-accent/10')}
    >
      <div
        onClick={onOpen && (() => onOpen())}
        {...middleClickProps(onOpen)}
        className={cx(
          cols,
          'h-12 transition-colors duration-150 hover:bg-surface-hover group-last:rounded-b-xl',
          onOpen && 'cursor-pointer',
        )}
      >
        {children}
      </div>
      {expansion}
    </div>
  )
}

export type MetaPart = string | number | null | undefined | false

/** Joins metadata parts with mid-dots, skipping empty ones */
export function joinMeta(parts: MetaPart[]): string {
  return parts.filter(p => p !== null && p !== undefined && p !== false && p !== '').join(' • ')
}

export interface MetaLineProps {
  parts: MetaPart[]
  className?: string
}

/** Muted single-line metadata, e.g. `18/10/2026 • Αγ. 4 • 6 σκακιέρες` */
export function MetaLine({ parts, className }: MetaLineProps) {
  const text = joinMeta(parts)
  return <div className={cx('truncate text-xs text-gray-500', className)} title={text}>{text}</div>
}

export interface RowTitleProps {
  title: ReactNode
  meta?: MetaPart[]
}

/** Title over a meta line, for a row's main cell */
export function RowTitle({ title, meta }: RowTitleProps) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-gray-900" title={typeof title === 'string' ? title : undefined}>
        {title}
      </div>
      {meta && <MetaLine parts={meta} />}
    </div>
  )
}

export interface ListEmptyProps {
  children: ReactNode
}

export function ListEmpty({ children }: ListEmptyProps) {
  return <p className="text-sm text-gray-500">{children}</p>
}
