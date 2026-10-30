import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Field, Input, Modal, Money } from '../ui'
import { useDebtsStore } from '../../store/debts'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import { parseMoney } from '../../../../shared/money'
import type { DebtRow } from '../../../../shared/debt'

export interface DebtBalanceDialogProps {
  debt: DebtRow
  /** A statement balance is already set: offer to go back to the app's own figure */
  hasOverride: boolean
  onClose: () => void
}

/** The balance on the bank's statement, for a variable rate or fees the app cannot know */
export function DebtBalanceDialog({ debt, hasOverride, onClose }: DebtBalanceDialogProps) {
  const { t } = useTranslation()
  const ids = { amount: useId(), date: useId() }
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayDateOnly)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(balanceCents: number | null) {
    setSaving(true)
    setError(null)
    try {
      await window.api.setDebtBalance({ debtId: debt.id, balanceCents, date })
      await useDebtsStore.getState().changed()
      onClose()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  function confirm() {
    const cents = parseMoney(amount)
    if (cents === null || cents < 0) { setError(t('debts.errors.amount_invalid')); return }
    void save(cents)
  }

  return (
    <Modal
      title={t('debts.balance.title', { name: debt.name })}
      subtitle={<>{t('debts.balance.app_says')} <Money cents={debt.remainingCents} /></>}
      onClose={onClose}
      closeDisabled={saving}
      size="sm"
      footer={
        <>
          {hasOverride && <Button variant="ghost" icon="undo" onClick={() => void save(null)} disabled={saving}>{t('debts.balance.clear')}</Button>}
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="check" loading={saving} onClick={confirm}>{t('debts.balance.save')}</Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); confirm() } }}>
        <p className="text-sm text-fg-muted">{t('debts.balance.intro')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('debts.balance.amount')} htmlFor={ids.amount} required>
            <Input id={ids.amount} inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-right tabular-nums" />
          </Field>
          <Field label={t('debts.balance.date')} htmlFor={ids.date} required>
            <DateInput id={ids.date} value={date} onChange={setDate} />
          </Field>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  )
}
