import { useTranslation } from 'react-i18next'
import { Button, IconButton, ListCard, MetaLine, Money } from '../ui'
import { Icon } from '../shell/icons'
import { ACCOUNT_KIND_ICON } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import type { AccountSummary } from '../../../../shared/ledger'

export interface AccountCardProps {
  account: AccountSummary
  onAddTransaction: () => void
  /** Bank accounts and cards: statement import is their main way in */
  onImport: () => void
  /** Past imports of this account (with Undo) */
  onHistory: () => void
  onOpenTransactions: () => void
  onEdit: () => void
}

/** One account: what it holds now, where its data comes from, and what to do next */
export function AccountCard({ account, onAddTransaction, onImport, onHistory, onOpenTransactions, onEdit }: AccountCardProps) {
  const { t } = useTranslation()
  const cash = account.kind === 'CASH'
  const source = cash ? t('accounts.source_cash') : account.importedUntil ? null : t('accounts.not_imported')

  return (
    <ListCard className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name={ACCOUNT_KIND_ICON[account.kind]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-fg" title={account.name}>{account.name}</h2>
          <MetaLine parts={[t(`accounts.kind.${account.kind}`), account.institution !== 'OTHER' && t(`accounts.institution.${account.institution}`)]} />
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0">
          <IconButton icon="receipt" size="sm" label={t('accounts.view_transactions')} onClick={onOpenTransactions} />
          <IconButton icon="pencil" size="sm" label={t('accounts.edit_named', { name: account.name })} onClick={onEdit} />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs text-fg-muted">{account.kind === 'CREDIT_CARD' ? t('accounts.balance_card') : t('accounts.balance')}</div>
        <div className="text-2xl font-semibold text-fg"><Money cents={account.balanceCents} currency={account.currency} /></div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
          {account.importedUntil && !cash && <>
            {/* Where the imports are, with Undo */}
            <button type="button" onClick={onHistory} title={t('import.history_title')} className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-fg">
              {t('accounts.imported_until', { date: formatDate(account.importedUntil) })}
            </button>
            <span aria-hidden="true">•</span>
          </>}
          <MetaLine parts={[source, t('log.count', { count: account.transactionCount })]} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!cash && <Button size="sm" icon="download" onClick={onImport}>{t('import.command')}</Button>}
        <Button size="sm" variant={cash ? 'secondary' : 'ghost'} icon="plus" onClick={onAddTransaction}>{t('log.add')}</Button>
      </div>
    </ListCard>
  )
}
