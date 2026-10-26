import { useTranslation } from 'react-i18next'
import { FilterChip, IconButton, SelectMenu } from '../ui'
import { CategoryPicker } from './CategoryPicker'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { currentMonth, useTransactionsStore } from '../../store/transactions'
import { addMonths } from '../../../../shared/date-only'
import { CATEGORY_TYPES, type CategoryType } from '../../../../shared/ledger'

/** "October 2026" in the app language */
export function monthLabel(month: string, lang: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'el-GR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
}

/** Month stepper, account, type and category pickers, and the "To categorise" switch; changes apply live */
export function TransactionFilters() {
  const { t, i18n } = useTranslation()
  const filter = useTransactionsStore(s => s.filter)
  const setFilter = useTransactionsStore(s => s.setFilter)
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const uncategorisedCount = useTransactionsStore(s => s.data?.uncategorisedCount ?? 0)

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" role="group" aria-label={t('log.month')}>
        <IconButton
          icon="chevron-down"
          className="rotate-90"
          label={t('log.prev_month')}
          disabled={!filter.month}
          onClick={() => filter.month && setFilter({ month: addMonths(filter.month, -1) })}
        />
        <span className="min-w-36 text-center text-sm font-medium text-fg first-letter:uppercase">
          {filter.month ? monthLabel(filter.month, i18n.language) : t('log.all_months')}
        </span>
        <IconButton
          icon="chevron-down"
          className="-rotate-90"
          label={t('log.next_month')}
          disabled={!filter.month}
          onClick={() => filter.month && setFilter({ month: addMonths(filter.month, 1) })}
        />
      </div>
      <FilterChip active={filter.month === null} onClick={() => setFilter({ month: filter.month ? null : currentMonth() })}>
        {t('log.all_months')}
      </FilterChip>

      <SelectMenu<string>
        value={filter.accountId ?? ''}
        ariaLabel={t('log.account')}
        onChange={v => setFilter({ accountId: v || null })}
        options={[
          { value: '', label: t('log.all_accounts') },
          ...activeAccounts(accounts).map(a => ({ value: a.id, label: a.name })),
        ]}
        triggerClassName="min-w-40"
      />
      <SelectMenu<string>
        value={filter.categoryType ?? ''}
        ariaLabel={t('log.type')}
        onChange={v => setFilter({ categoryType: (v || null) as CategoryType | null })}
        options={[
          { value: '', label: t('log.all_types') },
          ...CATEGORY_TYPES.map(type => ({ value: type, label: t(`categories.type.${type}`) })),
        ]}
        triggerClassName="min-w-36"
      />
      <div className="w-52">
        <CategoryPicker
          categories={categories}
          value={filter.categoryId ?? ''}
          onChange={v => setFilter({ categoryId: v || null })}
          kind="ANY"
          groupsSelectable
          ariaLabel={t('log.category')}
          leading={[{ value: '', label: t('log.all_categories') }]}
        />
      </div>
      <FilterChip active={filter.uncategorised} onClick={() => setFilter({ uncategorised: !filter.uncategorised })}>
        {t('log.to_categorise')}
        {uncategorisedCount > 0 && <span className="tabular-nums">({uncategorisedCount})</span>}
      </FilterChip>
    </div>
  )
}
