import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Meter, Money, StatTile } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { meterTone } from '../../lib/budget'
import type { BudgetSummary } from '../../../../shared/budget'

export interface BudgetSummaryTilesProps {
  summary: BudgetSummary
  /** Nothing booked yet: received / spent are left out */
  future: boolean
}

/** Expected income · Left to budget (zero-based) · Left to spend */
export function BudgetSummaryTiles({ summary, future }: BudgetSummaryTilesProps) {
  const { t } = useTranslation()
  const ltb = summary.leftToBudgetCents
  const lts = summary.leftToSpendCents
  const spentLabel = t('budget.spent_of', { spent: formatMoney(summary.actualOutCents), available: formatMoney(summary.availableOutCents) })

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatTile
        icon="arrow-down"
        label={t('budget.tile_income')}
        value={<Money cents={summary.plannedIncomeCents} />}
        hint={future ? t('budget.tile_income_future') : t('budget.tile_income_hint', { received: formatMoney(summary.actualIncomeCents) })}
      />
      <StatTile
        icon="target"
        label={t('budget.tile_left_to_budget')}
        value={<Money cents={ltb} />}
        hint={
          <span className={ltb === 0 && summary.plannedIncomeCents > 0 ? 'text-success-fg' : ltb < 0 ? 'text-red-700' : undefined}>
            {ltb < 0 && <Icon name="alert-triangle" size={12} className="mr-1 inline align-[-1px]" />}
            {ltb === 0 && summary.plannedIncomeCents > 0 && <Icon name="check" size={12} className="mr-1 inline align-[-1px]" />}
            {ltb === 0 ? t(summary.plannedIncomeCents > 0 ? 'budget.ltb_zero' : 'budget.ltb_no_income') : ltb > 0 ? t('budget.ltb_positive') : t('budget.ltb_negative')}
          </span>
        }
      />
      <StatTile
        icon="wallet"
        label={t('budget.tile_left_to_spend')}
        value={<Money cents={lts} />}
        hint={
          future ? t('budget.lts_future') : (
            <span className="flex flex-col gap-1">
              <span className={lts < 0 ? 'text-red-700' : undefined}>
                {lts < 0 ? t('budget.lts_over', { amount: formatMoney(-lts) }) : spentLabel}
              </span>
              <Meter value={summary.actualOutCents} max={summary.availableOutCents} tone={meterTone(summary.actualOutCents, summary.availableOutCents)} label={spentLabel} />
            </span>
          )
        }
      />
    </div>
  )
}
