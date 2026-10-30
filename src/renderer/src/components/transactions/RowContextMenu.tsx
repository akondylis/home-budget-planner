import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog, ContextMenu, SelectMenu, type ActionMenuItem } from '../ui'
import { MemberDot } from '../members/MemberDot'
import { CategoryPicker } from './CategoryPicker'
import { RuleForm } from '../categories/RuleForm'
import { rowTitle } from './TransactionList'
import { useLedgerStore } from '../../store/ledger'
import { useTransactionsStore } from '../../store/transactions'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { bulkTransferAccounts, kindForAmount, kindForAmounts, transferAccounts } from '../../lib/ledger'
import { activeMembers } from '../../lib/members'
import { HOUSEHOLD } from '../../../../shared/members'
import { merchantText } from '../../../../shared/payee-key'
import type { TransactionRow } from '../../../../shared/ledger'
import type { RuleSummary } from '../../../../shared/statement-import'

export interface RowMenuTarget {
  row: TransactionRow
  x: number
  y: number
}

export interface RowContextMenuProps {
  target: RowMenuTarget | null
  /** The ticked rows; a right-click on one of them acts on all of them */
  selectedRows: TransactionRow[]
  rules: RuleSummary[]
  onClose: () => void
  onPick: (ids: string[], value: string) => void
  onMember: (ids: string[], value: string) => void
  onTick: (id: string) => void
  onError: (message: string) => void
}

type Step = 'menu' | 'category' | 'member'

/** Right-click on a log row: the row's actions in one place, for that row or for the whole selection */
export function RowContextMenu({ target, selectedRows, rules, onClose, onPick, onMember, onTick, onError }: RowContextMenuProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const members = useLedgerStore(s => s.members)
  const openEntry = useLedgerStore(s => s.openEntry)
  const setFilter = useTransactionsStore(s => s.setFilter)
  const [step, setStep] = useState<Step>('menu')
  // Outlive the menu: a dialog opened from it stays after the menu closes
  const [ruleFor, setRuleFor] = useState<TransactionRow | null>(null)
  const [deleting, setDeleting] = useState<TransactionRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    setStep('menu')
    onClose()
  }

  async function remove(rows: TransactionRow[]) {
    setBusy(true)
    try {
      for (const row of rows) await window.api.deleteTransaction(row.id)
    } catch (err) {
      onError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
      setDeleting(null)
      useTransactionsStore.getState().setSelected([])
      await useLedgerStore.getState().changed()
    }
  }

  const dialogs = (
    <>
      {ruleFor && (
        <RuleForm
          rule={null}
          rules={rules}
          initialPattern={merchantText(ruleFor.description)}
          defaultCategoryId={ruleFor.categoryId}
          onClose={() => setRuleFor(null)}
          onSaved={() => {
            setRuleFor(null)
            void useLedgerStore.getState().changed()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={deleting.length === 1 ? t('entry.delete_title') : t('log.delete_many_title', { count: deleting.length })}
          message={
            deleting.length > 1
              ? t('log.delete_many_message')
              : deleting[0].transferId
                ? t('entry.delete_transfer_message')
                : t('entry.delete_message')
          }
          confirmLabel={t('entry.delete')}
          confirmIcon="trash"
          tone="danger"
          loading={busy}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  )

  if (!target) return dialogs

  const { row } = target
  const title = rowTitle(row, t)
  const ticked = selectedRows.some(r => r.id === row.id)
  // A right-click on a ticked row acts on the whole selection, like the bulk toolbar
  const scope = ticked && selectedRows.length > 1 ? selectedRows : [row]
  const ids = scope.map(r => r.id)
  const many = scope.length > 1
  const memberList = activeMembers(members)
  const bankText = row.importBatchId ? merchantText(row.description) : ''
  const similar = merchantText(row.description) || row.payee || ''

  const items: ActionMenuItem[] = [
    { id: 'edit', label: t('log.edit'), icon: 'pencil', onSelect: () => openEntry({ mode: 'edit', row }) },
    ...(row.transferId
      ? []
      : [
          { id: 'category', label: t('log.menu_set_category'), icon: 'tag' as const, keepOpen: true, onSelect: () => setStep('category') },
          ...(memberList.length > 0
            ? [{ id: 'member', label: t('log.menu_set_for'), icon: 'user' as const, keepOpen: true, onSelect: () => setStep('member') }]
            : []),
          {
            id: 'rule',
            label: t('log.menu_create_rule'),
            icon: 'repeat' as const,
            disabled: !bankText,
            reason: t('log.no_bank_text'),
            onSelect: () => setRuleFor(row),
          },
          { id: 'tick', label: ticked ? t('log.menu_unselect') : t('log.menu_select'), icon: 'check' as const, onSelect: () => onTick(row.id) },
        ]),
    ...(similar
      ? [{ id: 'similar', label: t('log.menu_similar'), icon: 'search' as const, onSelect: () => setFilter({ query: similar, month: null }) }]
      : []),
    {
      id: 'delete',
      label: many ? t('log.menu_delete_many', { count: scope.length }) : t('log.menu_delete'),
      icon: 'trash',
      danger: true,
      separated: true,
      onSelect: () => setDeleting(scope),
    },
  ]

  return (
    <>
      <ContextMenu
        point={{ x: target.x, y: target.y }}
        label={t('log.menu_label', { name: title })}
        heading={many ? t('log.menu_selected', { count: scope.length }) : title}
        items={items}
        onClose={close}
      >
        {step === 'category' ? (
          <div className="w-72 p-2">
            <CategoryPicker
              categories={categories}
              value={many ? null : row.categoryId}
              kind={many ? kindForAmounts(scope.map(r => r.amountCents)) : kindForAmount(row.amountCents)}
              ariaLabel={t('log.set_category')}
              placeholder={t('log.set_category')}
              transferTargets={many ? bulkTransferAccounts(accounts, scope) : transferAccounts(accounts, row.accountId, row.amountCents < 0)}
              incoming={scope.every(r => r.amountCents > 0)}
              onChange={value => {
                close()
                onPick(ids, value)
              }}
              creatable
              defaultOpen
            />
          </div>
        ) : step === 'member' ? (
          <div className="w-72 p-2">
            <SelectMenu<string>
              value={null}
              ariaLabel={t('log.set_for')}
              placeholder={t('log.set_for')}
              onChange={value => {
                close()
                onMember(ids, value)
              }}
              options={[
                { value: HOUSEHOLD, label: t('members.household') },
                ...memberList.map(m => ({ value: m.id, label: <MemberDot colour={m.colour} name={m.name} />, searchText: m.name })),
              ]}
              triggerClassName="w-full"
              defaultOpen
            />
          </div>
        ) : undefined}
      </ContextMenu>
      {dialogs}
    </>
  )
}
