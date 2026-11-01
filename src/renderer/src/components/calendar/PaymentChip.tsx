import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { HoverCardDetails, MenuList, Money, PAYMENT_STATUS_ICONS, PAYMENT_STATUS_KEYS, Popover, StatusBadge, cx, type ActionMenuItem } from '../ui'
import { formatDate } from '../../lib/date-format'
import { scheduleLabel } from '../../lib/recurring'
import { isIncome } from '../../lib/payment-calendar'
import type { UpcomingBill } from '../../../../shared/recurrence'

export interface PaymentChipProps {
  bill: UpcomingBill
  actions: ActionMenuItem[]
}

/**
 * One due date in a calendar cell: name and signed amount. Status is told by icon and
 * look, never colour alone: overdue (alert icon, danger tint), paid (check, muted),
 * skipped (minus, struck amount), income (+ amount, income edge). A click opens the
 * details with the same actions as the bills page.
 */
export function PaymentChip({ bill, actions }: PaymentChipProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const income = isIncome(bill)
  const settled = bill.status === 'PAID' || bill.status === 'SKIPPED'
  const overdue = bill.status === 'OVERDUE'
  const statusIcon = settled || overdue ? PAYMENT_STATUS_ICONS[bill.status] : null
  const schedule = scheduleLabel(bill.frequency, bill.interval)
  const what = bill.instalment ? t('debts.instalment_n', { n: bill.instalment.n, of: bill.instalment.of }) : t(schedule.key, { count: schedule.count })
  const statusText = t(PAYMENT_STATUS_KEYS[bill.status])

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${bill.name}, ${statusText}`}
        className={cx(
          'flex w-full min-w-0 flex-wrap items-center gap-x-1 overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-left text-xs hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
          overdue ? 'border-red-500 bg-red-50 text-red-700'
            : settled ? 'border-line bg-transparent text-fg-muted'
              : income ? 'border-chart-income bg-blue-50 text-fg'
                : 'border-chart-expense bg-surface-2 text-fg',
        )}
      >
        {statusIcon && <Icon name={statusIcon} size={12} className="shrink-0" />}
        {/* Names never truncate: a long one pushes the amount onto the next line */}
        <span className="flex-auto break-words">{bill.name}</span>
        <Money cents={bill.amountCents} signed className={cx('ml-auto shrink-0', bill.status === 'SKIPPED' && 'line-through')} />
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} className="w-72 rounded-md border border-line bg-surface shadow-lg">
        <div className="border-b border-line px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">{bill.name}</div>
              <div className="text-xs text-fg-muted">{[formatDate(bill.dueDate), what].join(' · ')}</div>
            </div>
            <div className="shrink-0 text-right text-sm font-semibold">
              {bill.amountVaries && <span className="mr-0.5 text-fg-muted" title={t('recurring.amount_varies')}>≈</span>}
              <Money cents={bill.amountCents} signed />
            </div>
          </div>
          <div className="mt-2"><StatusBadge status={bill.status} /></div>
          {bill.status === 'PAID' && bill.transactionText && (
            <HoverCardDetails
              details={[
                [t('recurring.paid_row'), bill.transactionText],
                [t('entry.date'), bill.transactionDate ? formatDate(bill.transactionDate) : null],
              ]}
            />
          )}
        </div>
        {actions.length > 0 && <div className="p-1"><MenuList label={t('recurring.more_for', { name: bill.name })} items={actions} onClose={() => setOpen(false)} /></div>}
      </Popover>
    </>
  )
}
