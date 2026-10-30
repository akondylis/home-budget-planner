import { useTranslation } from 'react-i18next'
import { Banner, Button } from '../ui'
import { formatMoney } from '../../../../shared/money'
import { overBudgetCategories, type OverviewMonth } from '../../../../shared/overview'

/** How many over-budget categories the banner names before "and N more" */
const NAMED = 2

export interface OverviewBannersProps {
  data: OverviewMonth
  onOpenBudget: () => void
  onShowUncategorised: () => void
}

/** What needs the parents this month, most urgent first: over the plan, then rows to categorise */
export function OverviewBanners({ data, onOpenBudget, onShowUncategorised }: OverviewBannersProps) {
  const { t } = useTranslation()
  const over = overBudgetCategories(data.budget.groups)
  const uncategorised = data.budget.uncategorisedCount
  if (over.length === 0 && uncategorised === 0) return null

  const named = over.slice(0, NAMED).map(c => t('overview.over_item', { name: c.name, amount: formatMoney(-c.leftCents) })).join(', ')
  return (
    <div className="mb-6 space-y-2">
      {over.length > 0 && (
        <Banner tone="warning" action={<Button size="sm" icon="target" onClick={onOpenBudget}>{t('overview.over_action')}</Button>}>
          {t('overview.over', { count: over.length, items: named })}
          {over.length > NAMED && ` ${t('overview.over_more', { count: over.length - NAMED })}`}
        </Banner>
      )}
      {uncategorised > 0 && (
        <Banner tone="warning" action={<Button size="sm" icon="tag" onClick={onShowUncategorised}>{t('budget.banner_uncategorised_action')}</Button>}>
          {t('budget.banner_uncategorised', { count: uncategorised })}
        </Banner>
      )}
    </div>
  )
}
