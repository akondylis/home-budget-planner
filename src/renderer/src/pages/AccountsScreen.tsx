import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActiveFilterPills, Button, EmptyCard, ListCard, Money, PageHeader, RowTitle, SectionHeader, Spinner } from '../components/ui'
import { AccountCard } from '../components/accounts/AccountCard'
import { AccountsToolbar } from '../components/accounts/AccountsToolbar'
import { MemberDot } from '../components/members/MemberDot'
import { AccountForm } from '../components/accounts/AccountForm'
import { QuickSetup } from '../components/accounts/QuickSetup'
import { activeAccounts, useLedgerStore } from '../store/ledger'
import { activeMembers } from '../lib/members'
import { useImportStore } from '../store/import'
import { useUiStore } from '../store/ui'
import { ACCOUNT_KIND_ICON } from '../lib/ledger'
import {
  EMPTY_ACCOUNT_FILTER, JOINT, applicableFilter, describeAccountFilters, filterAccounts, groupAccounts, isAccountFilterActive, presentValues, type AccountGroup,
} from '../lib/account-groups'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { sumMoney } from '../../../shared/money'
import { isSpendable, type AccountSummary } from '../../../shared/ledger'

export interface AccountsScreenProps {
  onOpenTransactions: (accountId: string) => void
  onImport: (accountId: string) => void
}

export function AccountsScreen({ onOpenTransactions, onImport }: AccountsScreenProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const loaded = useLedgerStore(s => s.loaded)
  const members = useLedgerStore(s => s.members)
  const hasMembers = activeMembers(members).length > 0
  const openEntry = useLedgerStore(s => s.openEntry)
  // undefined = closed, null = a new account
  const [editing, setEditing] = useState<AccountSummary | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const storedGroupBy = useUiStore(s => s.accountsGroupBy)
  const storedFilter = useUiStore(s => s.accountsFilter)
  const clearFilter = useUiStore(s => s.clearAccountsFilter)
  const setFilter = useUiStore(s => s.setAccountsFilter)

  const open = activeAccounts(accounts)
  const archived = accounts.filter(a => a.archived)
  // The toolbar shows from two accounts on; a stored choice whose control is not shown is ignored
  const toolbar = open.length > 1
  const values = presentValues(open, members)
  const filter = toolbar ? applicableFilter(storedFilter, values, hasMembers) : EMPTY_ACCOUNT_FILTER
  const groupBy = !toolbar || (storedGroupBy === 'holder' && !hasMembers) ? 'none' : storedGroupBy
  const filtered = isAccountFilterActive(filter)
  const visible = filterAccounts(open, filter)
  const groups = groupAccounts(visible, groupBy, members)
  // Meal-voucher balances buy only food, so they sit beside the total instead of inside it
  const total = sumMoney(visible.filter(a => isSpendable(a.kind)).map(a => a.balanceCents))
  const vouchers = visible.filter(a => !isSpendable(a.kind))
  const voucherPart = vouchers.length > 0 && <> • {t('accounts.vouchers_total')}: <Money cents={sumMoney(vouchers.map(a => a.balanceCents))} /></>
  const pills = describeAccountFilters(filter, t, values).map(pill => ({
    key: pill.key,
    label: pill.label,
    onRemove: () => setFilter(pill.clear(filter)),
  }))

  function groupTitle(group: AccountGroup): string {
    if (groupBy === 'kind') return t(`accounts.kind.${group.key}`)
    if (groupBy === 'institution') return t(`accounts.institution.${group.key}`)
    return group.key === JOINT ? t('accounts.holder_joint') : group.holder?.name ?? ''
  }

  function groupLeading(group: AccountGroup) {
    if (groupBy !== 'holder') return undefined
    return group.holder?.colour && group.key !== JOINT ? <MemberDot colour={group.holder.colour} size="md" /> : undefined
  }

  const subtitle = open.length === 0 ? undefined : filtered
    ? <>{t('accounts.total_shown')}: <Money cents={total} />{voucherPart} • {t('accounts.shown_of', { count: visible.length, total: open.length })}</>
    : <>{t('accounts.total')}: <Money cents={total} />{voucherPart}</>

  const grid = (list: typeof open) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          showHolder={hasMembers}
          groupedBy={groupBy}
          onAddTransaction={() => openEntry({ mode: 'create', accountId: account.id })}
          onImport={() => onImport(account.id)}
          onHistory={() => useImportStore.getState().openHistory(account.id)}
          onOpenTransactions={() => onOpenTransactions(account.id)}
          onEdit={() => setEditing(account)}
        />
      ))}
    </div>
  )

  async function restore(id: string) {
    try {
      await window.api.archiveAccount(id, false)
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('nav.accounts')}
        subtitle={subtitle}
        actions={
          // Quick setup owns the primary action until the first account exists
          <Button variant={open.length > 0 ? 'primary' : 'secondary'} icon="plus" onClick={() => setEditing(null)}>
            {t('accounts.add')}
          </Button>
        }
      />

      {!loaded ? (
        <div className="flex justify-center py-12 text-fg-muted"><Spinner size={20} /></div>
      ) : open.length === 0 ? (
        <QuickSetup />
      ) : (
        <>
          {toolbar && <AccountsToolbar groupBy={groupBy} filter={filter} values={values} hasMembers={hasMembers} />}
          <ActiveFilterPills pills={pills} onClearAll={clearFilter} />
          {visible.length === 0 ? (
            <EmptyCard icon="filter" title={t('accounts.no_match_title')} body={t('accounts.no_match_body')}>
              <Button icon="close" onClick={clearFilter}>{t('ui.filter_clear_all')}</Button>
            </EmptyCard>
          ) : groupBy === 'none' ? grid(visible) : (
            <div className="space-y-6">
              {groups.map(group => (
                <section key={group.key} aria-label={groupTitle(group)}>
                  <SectionHeader
                    title={groupTitle(group)}
                    icon={groupBy === 'kind' ? ACCOUNT_KIND_ICON[group.key as keyof typeof ACCOUNT_KIND_ICON] : groupBy === 'institution' ? 'bank' : 'users'}
                    leading={groupLeading(group)}
                    meta={t('accounts.count', { count: group.accounts.length })}
                    amount={<Money cents={group.totalCents} />}
                  />
                  {grid(group.accounts)}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
            {t('accounts.archived_toggle', { count: archived.length })}
          </Button>
          {showArchived && (
            <ListCard className="mt-2 divide-y divide-line">
              {archived.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <RowTitle title={a.name} meta={[t(`accounts.kind.${a.kind}`), t('log.count', { count: a.transactionCount })]} />
                  <Money cents={a.balanceCents} currency={a.currency} />
                  <Button size="sm" icon="undo" onClick={() => void restore(a.id)}>{t('accounts.restore')}</Button>
                </div>
              ))}
            </ListCard>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      )}

      {editing !== undefined && <AccountForm account={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
