import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ListCard, Money, PageHeader, RowTitle, Spinner } from '../components/ui'
import { AccountCard } from '../components/accounts/AccountCard'
import { AccountForm } from '../components/accounts/AccountForm'
import { QuickSetup } from '../components/accounts/QuickSetup'
import { activeAccounts, useLedgerStore } from '../store/ledger'
import { activeMembers } from '../lib/members'
import { useImportStore } from '../store/import'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { sumMoney } from '../../../shared/money'
import type { AccountSummary } from '../../../shared/ledger'

export interface AccountsScreenProps {
  onOpenTransactions: (accountId: string) => void
  onImport: (accountId: string) => void
}

export function AccountsScreen({ onOpenTransactions, onImport }: AccountsScreenProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const loaded = useLedgerStore(s => s.loaded)
  const hasMembers = useLedgerStore(s => activeMembers(s.members).length > 0)
  const openEntry = useLedgerStore(s => s.openEntry)
  // undefined = closed, null = a new account
  const [editing, setEditing] = useState<AccountSummary | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = activeAccounts(accounts)
  const archived = accounts.filter(a => a.archived)
  const total = sumMoney(open.map(a => a.balanceCents))

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
        subtitle={open.length > 0 ? <>{t('accounts.total')}: <Money cents={total} /></> : undefined}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {open.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              showHolder={hasMembers}
              onAddTransaction={() => openEntry({ mode: 'create', accountId: account.id })}
              onImport={() => onImport(account.id)}
              onHistory={() => useImportStore.getState().openHistory(account.id)}
              onOpenTransactions={() => onOpenTransactions(account.id)}
              onEdit={() => setEditing(account)}
            />
          ))}
        </div>
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
