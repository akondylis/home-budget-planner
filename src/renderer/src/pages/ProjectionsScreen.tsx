import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/shell/icons'
import { Banner, Button, ListCard, MetaLine, Money, PageHeader, Segmented, Spinner, StatTile } from '../components/ui'
import { BudgetEmptyState } from '../components/budget/BudgetEmptyState'
import { ProjectionChart } from '../components/projections/ProjectionChart'
import { ProjectionTable } from '../components/projections/ProjectionTable'
import { useProjectionsStore } from '../store/projections'
import { useLedgerStore } from '../store/ledger'
import { useUiStore } from '../store/ui'
import { monthLabel } from '../lib/budget-worksheet'
import { monthDate } from '../lib/budget'
import { repeatedPlanMonth } from '../lib/projection'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { formatMoney } from '../../../shared/money'
import { HORIZONS, type Horizon, type Projection } from '../../../shared/projection'

export interface ProjectionsScreenProps {
  onOpenBudget: (month: string) => void
  onOpenAccounts: () => void
  onOpenRecurring: () => void
}

/** Where the money is heading: month-end balances from today's money, the bills and the budget plan */
export function ProjectionsScreen({ onOpenBudget, onOpenAccounts, onOpenRecurring }: ProjectionsScreenProps) {
  const { t, i18n } = useTranslation()
  const months = useUiStore(s => s.projectionMonths)
  const data = useProjectionsStore(s => s.data)
  const error = useProjectionsStore(s => s.error)
  const revision = useLedgerStore(s => s.revision)
  const month = (m: string) => monthLabel(monthDate(m), i18n.language)

  // Reload on arrival, on another horizon and after any write elsewhere
  useEffect(() => {
    void useProjectionsStore.getState().load(months)
  }, [months, revision])

  const ready = data !== null && data.months.length === months
  const repeated = ready ? repeatedPlanMonth(data) : null

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('projections.title')}
        subtitle={ready && data.accountCount > 0 && (
          <MetaLine
            parts={[
              t('projections.meta_from', { amount: formatMoney(data.startCents) }),
              t('projections.meta_months', { count: months }),
              repeated && t('projections.meta_repeated', { month: month(repeated) }),
            ]}
          />
        )}
        actions={
          <Segmented<`${Horizon}`>
            label={t('projections.horizon_label')}
            value={`${months}`}
            options={HORIZONS.map(h => ({ value: `${h}` as const, label: t('projections.horizon', { count: h }) }))}
            onChange={v => useUiStore.getState().setProjectionMonths(Number(v) as Horizon)}
          />
        }
      />

      {error ? <Banner tone="warning" className="mb-4">{ipcErrorMessage(error, t)}</Banner> : null}
      {!ready && !error && <div className="flex justify-center py-12"><Spinner /></div>}

      {ready && (data.accountCount === 0 ? (
        <BudgetEmptyState
          title={t('projections.no_accounts_title')}
          body={t('projections.no_accounts_body')}
          actions={<Button variant="primary" icon="bank" onClick={onOpenAccounts}>{t('projections.no_accounts_action')}</Button>}
        />
      ) : (
        <>
          <ProjectionTiles data={data} months={months} />
          <ProjectionBanners data={data} onOpenBudget={onOpenBudget} onOpenRecurring={onOpenRecurring} />
          <ListCard className="mb-4 px-4 py-4">
            <h2 className="mb-2 text-sm font-semibold text-fg">{t('projections.chart_title')}</h2>
            <ProjectionChart data={data} />
          </ListCard>
          <ProjectionTable data={data} onOpenBudget={onOpenBudget} />
          <p className="mt-3 text-xs text-gray-500">{t('projections.footnote')}</p>
        </>
      ))}
    </div>
  )
}

function ProjectionTiles({ data, months }: { data: Projection; months: number }) {
  const { t, i18n } = useTranslation()
  const below = data.lowest.cents < 0
  const change = data.endCents - data.startCents
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <StatTile icon="wallet" label={t('projections.tile_today')} value={<Money cents={data.startCents} />} hint={t('projections.tile_today_hint')} />
      <StatTile
        icon="trending-up"
        label={t('projections.tile_lowest')}
        value={<Money cents={data.lowest.cents} />}
        hint={
          <span className={below ? 'font-medium text-red-700' : undefined}>
            {below && <Icon name="alert-triangle" size={12} className="mr-1 inline align-[-1px]" />}
            {t(below ? 'projections.tile_lowest_below' : 'projections.tile_lowest_hint', { month: monthLabel(monthDate(data.lowest.month), i18n.language) })}
          </span>
        }
      />
      <StatTile
        icon="calendar"
        label={t('projections.tile_end', { count: months })}
        value={<Money cents={data.endCents} />}
        hint={t(change >= 0 ? 'projections.tile_end_up' : 'projections.tile_end_down', { amount: formatMoney(Math.abs(change)) })}
      />
    </div>
  )
}

function ProjectionBanners({ data, onOpenBudget, onOpenRecurring }: { data: Projection; onOpenBudget: (month: string) => void; onOpenRecurring: () => void }) {
  const { t, i18n } = useTranslation()
  const first = data.firstNegativeMonth
  if (!data.hasRules && !data.hasPlan) {
    return (
      <Banner
        tone="info"
        className="mb-4"
        action={
          <div className="flex gap-2">
            <Button size="sm" icon="target" onClick={() => onOpenBudget(data.months[0].month)}>{t('projections.empty_budget')}</Button>
            <Button size="sm" variant="ghost" icon="repeat" onClick={onOpenRecurring}>{t('projections.empty_bills')}</Button>
          </div>
        }
      >
        {t('projections.empty_banner')}
      </Banner>
    )
  }
  if (!first) return null
  const firstMonth = data.months.find(m => m.month === first)!
  return (
    <Banner
      tone="warning"
      className="mb-4"
      action={<Button size="sm" icon="target" onClick={() => onOpenBudget(first)}>{t('projections.open_budget')}</Button>}
    >
      {t('projections.banner_below', { month: monthLabel(monthDate(first), i18n.language), amount: formatMoney(firstMonth.endCents) })}
    </Banner>
  )
}
