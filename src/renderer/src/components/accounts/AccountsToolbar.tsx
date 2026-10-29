import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterChip, FilterPopoverButton, FilterSection, Segmented } from '../ui'
import { Icon } from '../shell/icons'
import { MemberDot } from '../members/MemberDot'
import { useUiStore } from '../../store/ui'
import { JOINT, NO_BANK, countAccountFilters, toggleValue, type AccountFilter, type AccountGroupBy, type PresentValues } from '../../lib/account-groups'

export interface AccountsToolbarProps {
  /** As applied (a stored choice whose control is hidden reads as none) */
  groupBy: AccountGroupBy
  filter: AccountFilter
  /** What occurs among the open accounts; a section is offered only with two or more values */
  values: PresentValues
  hasMembers: boolean
}

/** Group by bank / holder / type, and the Filters (n) popover over the same three; changes apply live */
export function AccountsToolbar({ groupBy, filter, values, hasMembers }: AccountsToolbarProps) {
  const { t } = useTranslation()
  const setGroupBy = useUiStore(s => s.setAccountsGroupBy)
  const setFilter = useUiStore(s => s.setAccountsFilter)
  const clearFilter = useUiStore(s => s.clearAccountsFilter)
  const showKinds = values.kinds.length > 1
  const showBanks = values.institutions.length > 1
  const showHolders = hasMembers && values.holders.length > 1

  const groupOptions: { value: AccountGroupBy; label: string }[] = [
    { value: 'none', label: t('accounts.group.none') },
    { value: 'institution', label: t('accounts.group.institution') },
    ...(hasMembers ? [{ value: 'holder' as const, label: t('accounts.group.holder') }] : []),
    { value: 'kind', label: t('accounts.group.kind') },
  ]

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="section-label">{t('accounts.group_by')}</span>
        <Segmented<AccountGroupBy> label={t('accounts.group_by')} value={groupBy} options={groupOptions} onChange={setGroupBy} />
      </div>
      {(showKinds || showBanks || showHolders) && (
        <div className="ml-auto">
          <FilterPopoverButton count={countAccountFilters(filter)} onClearAll={clearFilter}>
            {showKinds && (
              <FilterSection label={t('accounts.filter_kind')}>
                <Chips>
                  {values.kinds.map(({ value, count }) => (
                    <FilterChip key={value} active={filter.kinds.includes(value)} onClick={() => setFilter({ kinds: toggleValue(filter.kinds, value) })}>
                      {t(`accounts.kind.${value}`)}
                      <Count n={count} />
                    </FilterChip>
                  ))}
                </Chips>
              </FilterSection>
            )}
            {showBanks && (
              <FilterSection label={t('accounts.filter_bank')}>
                <Chips>
                  {values.institutions.map(({ value, name, count }) => (
                    <FilterChip
                      key={value}
                      active={filter.institutions.includes(value)}
                      onClick={() => setFilter({ institutions: toggleValue(filter.institutions, value) })}
                    >
                      {value === NO_BANK ? t('accounts.no_bank') : name}
                      <Count n={count} />
                    </FilterChip>
                  ))}
                </Chips>
              </FilterSection>
            )}
            {showHolders && (
              <FilterSection label={t('accounts.filter_holder')}>
                <Chips>
                  {values.holders.map(h => (
                    <FilterChip key={h.id} active={filter.holders.includes(h.id)} onClick={() => setFilter({ holders: toggleValue(filter.holders, h.id) })}>
                      {h.id !== JOINT && h.name && h.colour
                        ? <MemberDot colour={h.colour} name={h.name} />
                        : <><Icon name="users" size={12} />{t('accounts.holder_joint')}</>}
                      <Count n={h.count} />
                    </FilterChip>
                  ))}
                </Chips>
              </FilterSection>
            )}
          </FilterPopoverButton>
        </div>
      )}
    </div>
  )
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex max-w-sm flex-wrap gap-1.5">{children}</div>
}

/** How many accounts the chip alone would show */
function Count({ n }: { n: number }) {
  return <span className="tabular-nums opacity-75">{n}</span>
}
