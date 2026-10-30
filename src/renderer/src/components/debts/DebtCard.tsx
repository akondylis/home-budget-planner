import { useTranslation } from 'react-i18next'
import { Badge, Meter, Money, joinMeta } from '../ui'
import { Icon } from '../shell/icons'
import { formatDate } from '../../lib/date-format'
import { rateLabel, shortMonthLabel } from '../../lib/debts'
import { formatMoney } from '../../../../shared/money'
import type { DebtRow } from '../../../../shared/debt'

export interface DebtCardProps {
  debt: DebtRow
  onOpen: () => void
}

export const DEBT_KIND_ICONS = { LOAN: 'bank', INSTALMENTS: 'credit-card', PERSONAL: 'users' } as const

/** Who the debt is with: the lender, the card or the person */
export function debtWho(d: DebtRow): string | null {
  return d.institutionName ?? (d.kind === 'INSTALMENTS' ? d.accountName : null) ?? d.counterparty
}

/** One debt: what is left (large), how far along, the next instalment and when it ends */
export function DebtCard({ debt, onOpen }: DebtCardProps) {
  const { t, i18n } = useTranslation()
  const paidOff = debt.remainingCents <= 0
  const paidCents = Math.max(0, debt.principalCents - debt.remainingCents)
  const progressLabel = t(debt.direction === 'OWED_TO_US' ? 'debts.progress_label_in' : 'debts.progress_label', { paid: formatMoney(paidCents), total: formatMoney(debt.principalCents) })
  const meta = joinMeta([debtWho(debt), debt.rateBp > 0 && rateLabel(debt.rateBp, i18n.language), debt.archived && t('debts.archived')])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start gap-3">
        <Icon name={DEBT_KIND_ICONS[debt.kind]} size={18} className="mt-0.5 shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg">{debt.name}</div>
          {meta && <div className="text-xs text-gray-500">{meta}</div>}
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold tabular-nums text-fg"><Money cents={debt.remainingCents} /></div>
          <div className="text-xs text-gray-500">{t(debt.direction === 'OWED_TO_US' ? 'debts.left_to_get' : 'debts.left_to_pay')}</div>
        </div>
      </div>

      <Meter value={paidCents} max={debt.principalCents} tone={paidOff ? 'income' : 'accent'} label={progressLabel} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-fg-muted">
          {debt.termMonths
            ? joinMeta([
                t('debts.paid_count', { paid: debt.paidCount, total: debt.termMonths }),
                debt.nextDue && t('debts.next_due', { date: formatDate(debt.nextDue.date), amount: formatMoney(debt.nextDue.amountCents) }),
              ])
            : progressLabel}
        </span>
        {paidOff ? (
          <Badge tone="success" icon="check">{t('debts.paid_off')}</Badge>
        ) : debt.neverEnds ? (
          <Badge tone="warning" icon="alert-triangle">{t('debts.never_ends_short')}</Badge>
        ) : debt.payoffDate ? (
          <span className="text-gray-500">{t('debts.ends', { month: shortMonthLabel(debt.payoffDate, i18n.language) })}</span>
        ) : null}
      </div>
    </button>
  )
}
