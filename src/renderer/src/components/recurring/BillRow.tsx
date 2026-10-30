import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HoverCard, HoverCardDetails, Money, RowTitle, StatusBadge, cx } from '../ui'
import { formatDate } from '../../lib/date-format'
import { scheduleLabel } from '../../lib/recurring'
import { daysBetween } from '../../../../shared/date-only'
import type { UpcomingBill } from '../../../../shared/recurrence'

export interface BillRowProps {
  bill: UpcomingBill
  today: string
  /** Row actions (the "…" menu); none on the Overview card */
  actions?: ReactNode
  onOpen?: () => void
  /** Narrow places (the Overview card): the date goes under the name, amount over the status */
  compact?: boolean
}

/** "Today", "In 3 days", "2 days ago", or the date further out */
export function relativeDue(dueDate: string, today: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const days = daysBetween(dueDate, today)
  if (days === 0) return t('recurring.today')
  if (days > 7) return formatDate(dueDate)
  return dueDate > today ? t('recurring.in_days', { count: days }) : t('recurring.days_ago', { count: days })
}

/** One due date: name and schedule, when, amount (signed), status; the paying row on hover */
export function BillRow({ bill, today, actions, onOpen, compact = false }: BillRowProps) {
  const { t } = useTranslation()
  const schedule = scheduleLabel(bill.frequency, bill.interval)
  const paid = bill.status === 'PAID'
  const settled = paid || bill.status === 'SKIPPED'
  const status = <StatusBadge status={bill.status} />
  const when = relativeDue(bill.dueDate, today, t)
  // A debt's instalment says which one it is; a bill says how often it comes
  const what = bill.instalment ? t('debts.instalment_n', { n: bill.instalment.n, of: bill.instalment.of }) : t(schedule.key, { count: schedule.count })
  const title = <RowTitle title={bill.name} meta={compact ? [when] : [what]} />

  if (compact) {
    return (
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2" title={formatDate(bill.dueDate)}>
        <div className="min-w-0 flex-1">{title}</div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
          <Money cents={bill.amountCents} signed />
          <StatusBadge status={bill.status} />
        </div>
      </button>
    )
  }

  return (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_auto_7rem_auto] items-center gap-3 px-4 py-2.5', settled && 'opacity-80')}>
      <div className="min-w-0">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block w-full min-w-0 text-left hover:underline">
            {title}
          </button>
        ) : title}
      </div>
      <div className={cx('whitespace-nowrap text-right text-sm', bill.status === 'OVERDUE' ? 'font-medium text-red-700' : 'text-fg-muted')} title={formatDate(bill.dueDate)}>
        {when}
      </div>
      <div className="text-right text-sm">
        {bill.amountVaries && <span className="mr-0.5 text-fg-muted" title={t('recurring.amount_varies')}>≈</span>}
        <Money cents={bill.amountCents} signed />
      </div>
      <div className="flex items-center justify-end gap-1">
        {paid && bill.transactionText ? (
          <HoverCard
            content={
              <>
                <div className="text-sm font-medium text-fg">{t(bill.paidBy === 'AUTO' ? 'recurring.paid_auto' : 'recurring.paid_hand')}</div>
                <HoverCardDetails
                  details={[
                    [t('recurring.paid_row'), bill.transactionText],
                    [t('entry.date'), bill.transactionDate ? formatDate(bill.transactionDate) : null],
                  ]}
                />
              </>
            }
          >
            {status}
          </HoverCard>
        ) : status}
        {actions}
      </div>
    </div>
  )
}
