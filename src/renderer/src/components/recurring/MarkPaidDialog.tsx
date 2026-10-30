import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, DateInput, Field, Input, ListCard, Modal, Money, RowTitle, Select, Spinner, cx } from '../ui'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useRecurringStore } from '../../store/recurring'
import { useUiStore } from '../../store/ui'
import { centsToInput } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import { parseMoney } from '../../../../shared/money'
import type { CandidateRow, UpcomingBill } from '../../../../shared/recurrence'

export interface MarkPaidDialogProps {
  bill: UpcomingBill
  onClose: () => void
}

/**
 * Pick the row that paid a due date (the likeliest first), or add it when it was paid in
 * cash. Imported rows that match need none of this: they mark the date paid by themselves.
 */
export function MarkPaidDialog({ bill, onClose }: MarkPaidDialogProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const open = activeAccounts(accounts)
  const ids = { account: useId(), date: useId(), amount: useId() }
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [cash, setCash] = useState(false)
  const [accountId, setAccountId] = useState(() => open.find(a => a.kind === 'CASH')?.id ?? open[0]?.id ?? '')
  const [bookedAt, setBookedAt] = useState(() => (bill.dueDate < todayDateOnly() ? bill.dueDate : todayDateOnly()))
  const [amount, setAmount] = useState(centsToInput(bill.amountCents))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    window.api.billCandidates({ ruleId: bill.ruleId, dueDate: bill.dueDate })
      .then(rows => {
        if (!live) return
        setCandidates(rows)
        if (rows[0]?.likely) setPicked(rows[0].id)
        // Nothing in the bank to pick: paying in cash is the likely answer
        if (rows.length === 0) setCash(true)
      })
      .catch(err => { if (live) { setCandidates([]); setError(ipcErrorMessage(err, t)) } })
    return () => { live = false }
  }, [bill.ruleId, bill.dueDate, t])

  async function confirm() {
    const cents = parseMoney(amount)
    if (cash && (cents === null || cents <= 0)) { setError(t('recurring.errors.amount_invalid')); return }
    setSaving(true)
    setError(null)
    try {
      const due = { ruleId: bill.ruleId, dueDate: bill.dueDate }
      if (cash) {
        await window.api.payBillInCash({ ...due, accountId, bookedAt, amountCents: cents!, createdByMemberId: useUiStore.getState().currentMemberId })
      } else {
        await window.api.markBillPaid({ ...due, transactionId: picked })
      }
      await useRecurringStore.getState().changed()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('recurring.mark_title', { name: bill.name })}
      subtitle={<>{t('recurring.due_on', { date: formatDate(bill.dueDate) })} · <Money cents={bill.amountCents} signed /></>}
      onClose={onClose}
      closeDisabled={saving}
      size="md"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={() => void confirm()} disabled={cash && !accountId} title={cash && !accountId ? t('recurring.no_account') : undefined}>
            {cash ? t('recurring.add_cash') : t('recurring.mark_paid')}
          </Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void confirm() } }}>
        {!cash && (
          candidates === null ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">{t('recurring.pick_row')}</legend>
              <ListCard className="max-h-72 divide-y divide-line overflow-y-auto">
                {candidates.map(row => (
                  <label key={row.id} className={cx('flex cursor-pointer items-center gap-3 px-3 py-2', picked === row.id && 'bg-accent/10')}>
                    <input type="radio" name="paying-row" checked={picked === row.id} onChange={() => setPicked(row.id)} />
                    <div className="min-w-0 flex-1">
                      <RowTitle title={row.text} meta={[formatDate(row.bookedAt), row.accountName]} />
                    </div>
                    {row.likely && <Badge tone="success" icon="check">{t('recurring.likely')}</Badge>}
                    <Money cents={row.amountCents} signed />
                  </label>
                ))}
                <label className={cx('flex cursor-pointer items-center gap-3 px-3 py-2', picked === null && 'bg-accent/10')}>
                  <input type="radio" name="paying-row" checked={picked === null} onChange={() => setPicked(null)} />
                  <div className="min-w-0 flex-1">
                    <RowTitle title={t('recurring.no_row')} meta={[t('recurring.no_row_hint')]} />
                  </div>
                </label>
              </ListCard>
            </fieldset>
          )
        )}

        {cash ? (
          <>
            <p className="text-sm text-fg-muted">{t('recurring.cash_intro')}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('recurring.amount')} htmlFor={ids.amount} required>
                <Input id={ids.amount} inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-right tabular-nums" />
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
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setCash(true)}>{t('recurring.paid_in_cash')}</Button>
        )}

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
