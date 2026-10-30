import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Banner, Button, IconButton, ListCard, Modal, Money, RowTitle, SectionHeader, Spinner, StatusBadge, cx, joinMeta, type ActionMenuItem } from '../ui'
import { MarkPaidDialog } from '../recurring/MarkPaidDialog'
import { DebtPaymentDialog } from './DebtPaymentDialog'
import { DebtBalanceDialog } from './DebtBalanceDialog'
import { debtWho } from './DebtCard'
import { useLedgerStore } from '../../store/ledger'
import { useDebtsStore } from '../../store/debts'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { rateLabel, shortMonthLabel } from '../../lib/debts'
import { sumMoney } from '../../../../shared/money'
import type { DebtDetail as Detail } from '../../../../shared/debt'
import type { UpcomingBill } from '../../../../shared/recurrence'

export interface DebtDetailProps {
  id: string
  onClose: () => void
}

/** One debt: what is left and when it ends, its schedule with what is paid, and what to do next */
export function DebtDetail({ id, onClose }: DebtDetailProps) {
  const { t, i18n } = useTranslation()
  const revision = useLedgerStore(s => s.revision)
  const [debt, setDebt] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState<UpcomingBill | null>(null)
  const [paying, setPaying] = useState(false)
  const [balance, setBalance] = useState(false)

  useEffect(() => {
    let live = true
    window.api.getDebt(id)
      .then(d => { if (live) { setDebt(d); setError(null) } })
      .catch(err => { if (live) setError(ipcErrorMessage(err, t)) })
    return () => { live = false }
  }, [id, revision, t])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await useDebtsStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    }
  }

  /** The due date as the bills page knows it, so Mark as paid works the same everywhere */
  async function markPaid(dueDate: string) {
    if (!debt?.ruleId) return
    const bill = (await window.api.billOccurrences({ from: dueDate, to: dueDate })).find(b => b.ruleId === debt.ruleId)
    if (bill) setMarking(bill)
  }

  function edit() {
    if (!debt) return
    useDebtsStore.getState().openForm({ mode: 'edit', debt })
  }

  if (!debt) {
    return (
      <Modal title={t('debts.loading')} onClose={onClose} size="lg">
        {error ? <Banner tone="warning">{error}</Banner> : <div className="flex justify-center py-12"><Spinner /></div>}
      </Modal>
    )
  }

  const incoming = debt.direction === 'OWED_TO_US'
  const paidOff = debt.remainingCents <= 0
  const showInterest = debt.rateBp > 0
  const extras = debt.payments.filter(p => p.kind === 'EXTRA')
  const actions: ActionMenuItem[] = [
    { id: 'edit', label: t('debts.edit'), icon: 'pencil', onSelect: edit },
    ...(debt.kind === 'LOAN' ? [{ id: 'balance', label: t('debts.balance.menu'), icon: 'file-text' as const, onSelect: () => setBalance(true) }] : []),
    debt.archived
      ? { id: 'restore', label: t('debts.restore'), icon: 'undo', onSelect: () => void run(() => window.api.setDebtArchived(debt.id, false)) }
      : { id: 'archive', label: t('debts.archive'), icon: 'folder', onSelect: () => void run(() => window.api.setDebtArchived(debt.id, true)) },
  ]
  const recordLabel = t(incoming ? 'debts.payment.record_in' : debt.termMonths ? 'debts.payment.record_extra' : 'debts.payment.record_out')

  return (
    <Modal
      title={debt.name}
      subtitle={joinMeta([t(`debts.kind.${debt.kind}`), debtWho(debt), debt.rateBp > 0 && rateLabel(debt.rateBp, i18n.language), debt.archived && t('debts.archived')])}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <ActionMenu label={t('debts.more_for', { name: debt.name })} items={actions} />
          <span className="flex-1" />
          <Button variant="ghost" icon="close" onClick={onClose}>{t('common.close')}</Button>
          {!paidOff && !debt.archived && <Button variant="primary" icon="plus" onClick={() => setPaying(true)}>{recordLabel}</Button>}
        </>
      }
    >
      <div className="space-y-5">
        {error && <Banner tone="warning">{error}</Banner>}
        {paidOff && !debt.archived && (
          <Banner tone="success" icon="check-circle" action={<Button size="sm" icon="folder" onClick={() => void run(() => window.api.setDebtArchived(debt.id, true))}>{t('debts.archive')}</Button>}>
            {t(incoming ? 'debts.paid_back_banner' : 'debts.paid_off_banner')}
          </Banner>
        )}
        {debt.neverEnds && <Banner tone="warning">{t('debts.never_ends')}</Banner>}

        <dl className="grid grid-cols-3 gap-3">
          <Figure label={t(incoming ? 'debts.left_to_get_label' : 'debts.left_to_pay_label')} value={<Money cents={debt.remainingCents} />}
            hint={debt.balanceOverride ? t('debts.from_statement', { date: formatDate(debt.balanceOverride.date) }) : <>{t('debts.of_total')} <Money cents={debt.principalCents} /></>} />
          {debt.termMonths ? (
            <Figure
              label={t('debts.payoff')}
              value={debt.payoffDate ? shortMonthLabel(debt.payoffDate, i18n.language) : paidOff ? t('debts.paid_off') : '—'}
              hint={t('debts.paid_count', { paid: debt.paidCount, total: debt.termMonths })}
            />
          ) : (
            // No schedule: what has come back so far and since when
            <Figure
              label={t(incoming ? 'debts.repaid_in' : 'debts.repaid_out')}
              value={<Money cents={sumMoney(debt.payments.map(p => p.amountCents))} />}
              hint={t('debts.payments_count', { count: debt.payments.length })}
            />
          )}
          {!debt.termMonths ? (
            <Figure label={t('debts.since')} value={formatDate(debt.startDate)} />
          ) : showInterest ? (
            <Figure label={t('debts.interest_to_go')} value={<Money cents={debt.interestToGoCents} />} hint={t('debts.interest_hint')} />
          ) : (
            <Figure label={t('debts.instalment')} value={debt.instalmentCents ? <Money cents={debt.instalmentCents} /> : '—'} hint={debt.instalmentCents ? t('debts.per_month') : undefined} />
          )}
        </dl>

        {extras.length > 0 && (
          <section aria-label={t('debts.payments')}>
            <SectionHeader title={t(debt.termMonths ? 'debts.payments' : incoming ? 'debts.payments_in' : 'debts.payments_out')} meta={t('recurring.count', { count: extras.length })} />
            <ListCard className="divide-y divide-line">
              {extras.map(p => (
                <div key={p.transactionId} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1"><RowTitle title={p.text ?? ''} meta={[formatDate(p.date)]} /></div>
                  <Money cents={p.amountCents} />
                  <IconButton icon="undo" label={t('debts.unlink')} onClick={() => void run(() => window.api.unlinkDebtPayment(p.transactionId!))} />
                </div>
              ))}
            </ListCard>
          </section>
        )}

        {debt.schedule.length > 0 && (
          <section aria-label={t('debts.schedule')}>
            <SectionHeader title={t('debts.schedule')} meta={t('debts.schedule_hint')} />
            <ListCard className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-fg-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-3 py-2 text-left font-medium">#</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('debts.col_due')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('debts.col_payment')}</th>
                    {showInterest && <th scope="col" className="px-3 py-2 text-right font-medium">{t('debts.col_interest')}</th>}
                    {showInterest && <th scope="col" className="px-3 py-2 text-right font-medium">{t('debts.col_principal')}</th>}
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('debts.col_balance')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('debts.col_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {debt.schedule.map(row => {
                    const open = row.status === 'OVERDUE' || row.status === 'DUE'
                    return (
                      <tr key={row.n} className={cx('border-b border-line/60', row.status === 'PAID' && 'text-fg-muted')}>
                        <td className="px-3 py-1.5 tabular-nums">{row.n}</td>
                        <td className="px-3 py-1.5">{formatDate(row.dueDate)}</td>
                        <td className="px-3 py-1.5 text-right"><Money cents={row.paymentCents} /></td>
                        {showInterest && <td className="px-3 py-1.5 text-right"><Money cents={row.interestCents} /></td>}
                        {showInterest && <td className="px-3 py-1.5 text-right"><Money cents={row.principalCents} /></td>}
                        <td className="px-3 py-1.5 text-right"><Money cents={row.balanceCents} /></td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            {open && !debt.archived && <Button size="sm" icon="check" onClick={() => void markPaid(row.dueDate)}>{t('recurring.mark_paid_menu')}</Button>}
                            <StatusBadge status={row.status} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ListCard>
          </section>
        )}

        {debt.note && <p className="whitespace-pre-line text-sm text-fg-muted">{debt.note}</p>}
      </div>

      {marking && <MarkPaidDialog bill={marking} onClose={() => setMarking(null)} />}
      {paying && <DebtPaymentDialog debt={debt} onClose={() => setPaying(false)} />}
      {balance && <DebtBalanceDialog debt={debt} hasOverride={debt.balanceOverride !== null} onClose={() => setBalance(false)} />}
    </Modal>
  )
}

function Figure({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</dd>
      {hint && <dd className="text-xs text-gray-500">{hint}</dd>}
    </div>
  )
}
