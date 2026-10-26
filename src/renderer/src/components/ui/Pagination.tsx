import { useTranslation } from 'react-i18next'
import { IconButton } from './IconButton'
import { Select } from './Field'

export interface PaginationProps {
  /** Zero-based */
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** With `total` and `onPageSizeChange`: shows "1–25 of 142" and a rows-per-page picker */
  pageSize?: number
  pageSizes?: number[]
  total?: number
  onPageSizeChange?: (size: number) => void
}

export function Pagination({ page, totalPages, onChange, pageSize, pageSizes, total, onPageSizeChange }: PaginationProps) {
  const { t } = useTranslation()
  const sized = pageSize !== undefined && total !== undefined && !!pageSizes && !!onPageSizeChange
  // The picker is only worth showing once there are more rows than the smallest page
  if (sized ? total <= Math.min(...pageSizes) : totalPages <= 1) return null

  const pager = totalPages > 1 && (
    <div className="flex items-center gap-2">
      <IconButton
        icon="chevron-down"
        className="rotate-90"
        label={t('ui.page_prev')}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      />
      <span className="tabular-nums">{page + 1} / {totalPages}</span>
      <IconButton
        icon="chevron-down"
        className="-rotate-90"
        label={t('ui.page_next')}
        disabled={page === totalPages - 1}
        onClick={() => onChange(page + 1)}
      />
    </div>
  )
  if (!sized) return <div className="flex items-center justify-center py-3 text-sm text-gray-600">{pager}</div>

  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-gray-600">
      <span className="tabular-nums">{t('ui.page_range', { from, to, total })}</span>
      {pager}
      <label className="flex items-center gap-2 text-xs">
        {t('ui.page_size')}
        <Select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="w-auto py-1 text-xs"
        >
          {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </label>
    </div>
  )
}
