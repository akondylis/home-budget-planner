import { useTranslation } from 'react-i18next'
import { Badge, Button, IconButton, ListCard, MetaLine, Money } from '../ui'
import { MemberDot } from '../members/MemberDot'
import { Icon } from '../shell/icons'
import { ACCOUNT_KIND_ICON, isImportable } from '../../lib/ledger'
import type { AccountGroupBy } from '../../lib/account-groups'
import { formatDate } from '../../lib/date-format'
import type { AccountSummary } from '../../../../shared/ledger'

export interface AccountCardProps {
  account: AccountSummary
  /** Members exist, so an account without a holder reads "Joint" */
  showHolder: boolean
  onAddTransaction: () => void
  /** Bank accounts and cards: statement import is their main way in */
  onImport: () => void
  /** Past imports of this account (with Undo) */
  onHistory: () => void
  onOpenTransactions: () => void
  onEdit: () => void
  /** Inside a group the card leaves out what the group header already says (its bank, type or holder) */
  groupedBy?: AccountGroupBy
}

/** One account: what it holds now, where its data comes from, and what to do next */
export function AccountCard({
  account, showHolder, onAddTransaction, onImport, onHistory, onOpenTransactions, onEdit, groupedBy = 'none',
}: AccountCardProps) {
  const { t } = useTranslation()
  // Under a group header the name is one level down
  const Heading = groupedBy === 'none' ? 'h2' : 'h3'
  const holderLine = showHolder && groupedBy !== 'holder'
  const voucher = account.kind === 'MEAL_VOUCHER'
  // Cash and meal-voucher cards are entered by hand; the rest come from statements
  const importable = isImportable(account.kind)
  const source = !importable ? t('accounts.source_cash') : account.importedUntil ? null : t('accounts.not_imported')
  const balanceLabel = account.kind === 'CREDIT_CARD' ? t('accounts.balance_card') : voucher ? t('accounts.balance_voucher') : t('accounts.balance')

  return (
    <ListCard className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name={ACCOUNT_KIND_ICON[account.kind]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <Heading className="truncate text-sm font-semibold text-fg" title={account.name}>{account.name}</Heading>
          <MetaLine parts={[
            groupedBy !== 'kind' && t(`accounts.kind.${account.kind}`),
            groupedBy !== 'institution' && account.institution !== 'OTHER' && t(`accounts.institution.${account.institution}`),
          ]} />
          {/* Its own line, so the bank never truncates to make room for the holder */}
          {holderLine && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500" title={`${t('accounts.holder')}: ${account.holderName ?? t('accounts.holder_joint')}`}>
              {account.holderName && account.holderColour
                ? <MemberDot colour={account.holderColour} name={account.holderName} />
                : <><Icon name="users" size={12} className="shrink-0" />{t('accounts.holder_joint')}</>}
            </div>
          )}
          {account.cards.length > 0 && (
            <ul
              aria-label={t('accounts.cards')}
              title={account.cards.map(c => `•••• ${c.last4}${c.holderName ? ` ${c.holderName}` : ''}`).join(' · ')}
              className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500"
            >
              {account.cards.map(c => (
                <li key={c.id} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="tabular-nums">•••• {c.last4}</span>
                  {c.holderName && c.holderColour && <MemberDot colour={c.holderColour} name={c.holderName} />}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0">
          <IconButton icon="receipt" size="sm" label={t('accounts.view_transactions')} onClick={onOpenTransactions} />
          <IconButton icon="pencil" size="sm" label={t('accounts.edit_named', { name: account.name })} onClick={onEdit} />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs text-fg-muted">{balanceLabel}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-semibold text-fg"><Money cents={account.balanceCents} currency={account.currency} /></span>
          {voucher && <Badge icon="utensils" title={t('accounts.food_only_hint')}>{t('accounts.food_only')}</Badge>}
          {voucher && account.balanceCents < 0 && (
            <Badge tone="warning" icon="alert-triangle" title={t('accounts.voucher_negative_hint')}>{t('accounts.voucher_negative')}</Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
          {account.importedUntil && importable && <>
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
        {importable && <Button size="sm" icon="download" onClick={onImport}>{t('import.command')}</Button>}
        <Button size="sm" variant={importable ? 'ghost' : 'secondary'} icon="plus" onClick={onAddTransaction}>{t('log.add')}</Button>
      </div>
    </ListCard>
  )
}
