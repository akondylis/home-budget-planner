import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, DateInput, Field, Input, ListCard, Modal, Money, RowTitle, Select, Spinner, cx } from '../ui'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useDebtsStore } from '../../store/debts'
import { useUiStore } from '../../store/ui'
import { centsToInput } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import { parseMoney } from '../../../../shared/money'
import type { DebtRow } from '../../../../shared/debt'
import type { CandidateRow } from '../../../../shared/recurrence'

export interface DebtPaymentDialogProps {
  debt: DebtRow
  onClose: () => void
}

/**
 * Count a row as a payment of this debt (an extra payment on a loan, money paid back or
 * received on a personal one), or add it when it was cash. Instalments need none of this.
 */
export function DebtPaymentDialog({ debt, onClose }: DebtPaymentDialogProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const open = activeAccounts(accounts).filter(a => a.kind !== 'MEAL_VOUCHER')
  const ids = { account: useId(), date: useId(), amount: useId() }
  const incoming = debt.direction === 'OWED_TO_US'
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [cash, setCash] = useState(false)
  const [accountId, setAccountId] = useState(() => open.find(a => a.kind === 'CASH')?.id ?? open[0]?.id ?? '')
  const [bookedAt, setBookedAt] = useState(todayDateOnly)
  const [amount, setAmount] = useState(() => (debt.instalmentCents && !debt.termMonths ? centsToInput(debt.instalmentCents) : ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    window.api.debtPaymentCandidates(debt.id)
      .then(rows => {
        if (!live) return
        setCandidates(rows)
        if (rows[0]?.likely) setPicked(rows[0].id)
        if (rows.length === 0) setCash(true)
      })
      .catch(err => { if (live) { setCandidates([]); setCash(true); setError(ipcErrorMessage(err, t)) } })
    return () => { live = false }
  }, [debt.id, t])

  const cents = parseMoney(amount)
  const blocked = cash ? !accountId : picked === null

  async function confirm() {
    if (cash && (cents === null || cents <= 0)) { setError(t('debts.errors.amount_invalid')); return }
    if (blocked) return
    setSaving(true)
    setError(null)
    try {
      if (cash) {
        await window.api.recordDebtCash({ debtId: debt.id, accountId, bookedAt, amountCents: cents!, createdByMemberId: useUiStore.getState().currentMemberId })
      } else {
        await window.api.linkDebtPayment({ debtId: debt.id, transactionId: picked! })
      }
      await useDebtsStore.getState().changed()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  const title = t(incoming ? 'debts.payment.title_in' : debt.termMonths ? 'debts.payment.title_extra' : 'debts.payment.title_out', { name: debt.name })

  return (
    <Modal
      title={title}
      subtitle={<>{t(incoming ? 'debts.left_to_get' : 'debts.left_to_pay')} <Money cents={debt.remainingCents} /></>}
      onClose={onClose}
      closeDisabled={saving}
      size="md"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            onClick={() => void confirm()}
            disabled={blocked}
            title={blocked ? t(cash ? 'recurring.no_account' : 'debts.payment.pick_first') : undefined}
          >
            {cash ? t(incoming ? 'debts.payment.add_cash_in' : 'debts.payment.add_cash') : t('debts.payment.link')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void confirm() } }}>
        {debt.termMonths !== null && !incoming && <p className="text-sm text-fg-muted">{t('debts.payment.extra_intro')}</p>}
        {!cash && (
          candidates === null ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">{t('debts.payment.pick_row')}</legend>
              <ListCard className="max-h-72 divide-y divide-line overflow-y-auto">
                {candidates.map(row => (
                  <label key={row.id} className={cx('flex cursor-pointer items-center gap-3 px-3 py-2', picked === row.id && 'bg-accent/10')}>
                    <input type="radio" name="debt-row" checked={picked === row.id} onChange={() => setPicked(row.id)} />
                    <div className="min-w-0 flex-1">
                      <RowTitle title={row.text} meta={[formatDate(row.bookedAt), row.accountName]} />
                    </div>
                    {row.likely && <Badge tone="success" icon="check">{t('recurring.likely')}</Badge>}
                    <Money cents={row.amountCents} signed />
                  </label>
                ))}
              </ListCard>
            </fieldset>
          )
        )}

        {cash ? (
          <>
            <p className="text-sm text-fg-muted">{t(incoming ? 'debts.payment.cash_intro_in' : 'debts.payment.cash_intro_out')}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('recurring.amount')} htmlFor={ids.amount} required>
                <Input id={ids.amount} inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-right tabular-nums" />
              </Field>
              <Field label={t('entry.date')} htmlFor={ids.date} required>
                <DateInput id={ids.date} value={bookedAt} onChange={setBookedAt} />
              </Field>
              <Field label={t('entry.account')} htmlFor={ids.account} required>
                <Select id={ids.account} value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full">
                  {open.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
            {candidates !== null && candidates.length > 0 && (
              <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => setCash(false)}>{t('recurring.back_to_rows')}</Button>
            )}
          </>
        ) : (
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setCash(true)}>{t('debts.payment.not_in_bank')}</Button>
        )}

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
