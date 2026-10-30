import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Meter, Money, StatTile } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { meterTone } from '../../lib/budget'
import type { OverviewMonth } from '../../../../shared/overview'

export interface OverviewTilesProps {
  /** null while the first load runs */
  data: OverviewMonth | null
  totals: { spendableCents: number; voucherCents: number; count: number }
  onShowMonth: () => void
  onOpenBudget: () => void
  onOpenAccounts: () => void
}

/** Income · Spent · Left to spend · In accounts; each tile opens where its number comes from */
export function OverviewTiles({ data, totals, onShowMonth, onOpenBudget, onOpenAccounts }: OverviewTilesProps) {
  const { t } = useTranslation()
  const pending = <span className="text-fg-muted">…</span>
  // A word in place of a number keeps the tile's height
  const word = (text: string) => <span className="block truncate text-base leading-8 text-fg-muted">{text}</span>
  const summary = data?.budget.summary
  const planned = data?.budget.exists ?? false
  const lts = summary?.leftToSpendCents ?? 0
  const spentLabel = summary
    ? t('budget.spent_of', { spent: formatMoney(summary.actualOutCents), available: formatMoney(summary.availableOutCents) })
    : ''

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TileButton label={t('overview.income_go')} onClick={onShowMonth}>
        <StatTile
          icon="arrow-down"
          label={t('overview.income')}
          value={data ? <Money cents={data.incomeCents} /> : pending}
          hint={summary && summary.plannedIncomeCents > 0
            ? t('overview.income_expected', { amount: formatMoney(summary.plannedIncomeCents) })
            : t('overview.income_hint')}
        />
      </TileButton>
      <TileButton label={t('overview.expenses_go')} onClick={onShowMonth}>
        <StatTile
          icon="arrow-up"
          label={t('overview.expenses')}
          value={data ? <Money cents={data.spentCents} /> : pending}
          hint={t('overview.expenses_hint')}
        />
      </TileButton>
      <TileButton label={t('overview.left_to_spend_go')} onClick={onOpenBudget}>
        <StatTile
          icon="wallet"
          label={t('overview.left_to_spend')}
          value={!data ? pending : planned ? <Money cents={lts} /> : word(t('overview.no_plan'))}
          hint={!data ? undefined : !planned ? <span className="text-accent">{t('overview.no_plan_go')}</span> : (
            <span className="flex flex-col gap-1">
              <span className={lts < 0 ? 'text-red-700' : undefined}>
                {lts < 0 ? t('budget.lts_over', { amount: formatMoney(-lts) }) : spentLabel}
              </span>
              <Meter value={summary!.actualOutCents} max={summary!.availableOutCents} tone={meterTone(summary!.actualOutCents, summary!.availableOutCents)} label={spentLabel} />
            </span>
          )}
        />
      </TileButton>
      <TileButton label={t('overview.balance_go')} onClick={onOpenAccounts}>
        <StatTile
          icon="bank"
          label={t('overview.balance')}
          value={totals.count === 0 ? word(t('overview.no_accounts')) : <Money cents={totals.spendableCents} />}
          hint={totals.count === 0 ? undefined : totals.voucherCents !== 0
            ? <span title={t('overview.balance_vouchers_title')}>{t('overview.balance_vouchers', { amount: formatMoney(totals.voucherCents) })}</span>
            : t('overview.balance_hint', { count: totals.count })}
        />
      </TileButton>
    </div>
  )
}

/** The whole tile is the link; the visible label stays the tile's own */
function TileButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="rounded-xl text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 [&>.card]:h-full"
    >
      {children}
    </button>
  )
}
