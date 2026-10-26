import { useTranslation } from 'react-i18next'
import { Button, IconButton, ListCard, MetaLine, Money } from '../ui'
import { Icon } from '../shell/icons'
import { ACCOUNT_KIND_ICON } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import type { AccountSummary } from '../../../../shared/ledger'

export interface AccountCardProps {
  account: AccountSummary
  onAddTransaction: () => void
  onOpenTransactions: () => void
  onEdit: () => void
}

/** One account: what it holds now, where its data comes from, and what to do next */
export function AccountCard({ account, onAddTransaction, onOpenTransactions, onEdit }: AccountCardProps) {
  const { t } = useTranslation()
  const cash = account.kind === 'CASH'
  const source = cash
    ? t('accounts.source_cash')
    : account.importedUntil
      ? t('accounts.imported_until', { date: formatDate(account.importedUntil) })
      : t('accounts.not_imported')

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
        <IconButton icon="pencil" size="sm" label={t('accounts.edit_named', { name: account.name })} onClick={onEdit} />
      </div>

      <div className="mt-3">
        <div className="text-xs text-fg-muted">{account.kind === 'CREDIT_CARD' ? t('accounts.balance_card') : t('accounts.balance')}</div>
        <div className="text-2xl font-semibold text-fg"><Money cents={account.balanceCents} currency={account.currency} /></div>
        <MetaLine parts={[source, t('log.count', { count: account.transactionCount })]} className="mt-0.5" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" icon="plus" onClick={onAddTransaction}>{t('log.add')}</Button>
        <Button size="sm" variant="ghost" icon="receipt" onClick={onOpenTransactions}>{t('accounts.view_transactions')}</Button>
      </div>
    </ListCard>
  )
}
