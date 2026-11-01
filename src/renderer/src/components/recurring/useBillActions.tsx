import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionMenuItem } from '../ui'
import { MarkPaidDialog } from './MarkPaidDialog'
import { useRecurringStore } from '../../store/recurring'
import { useDebtsStore } from '../../store/debts'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { UpcomingBill } from '../../../../shared/recurrence'

/**
 * The actions on one due date, the same on the bills page and the calendar:
 * Mark as paid…, Skip this one, Mark as unpaid (hand marks only), Edit bill / Open debt.
 * Render `dialog` once in the page; `error` is the last failed action's message.
 */
export function useBillActions() {
  const { t } = useTranslation()
  const rules = useRecurringStore(s => s.rules)
  const openForm = useRecurringStore(s => s.openForm)
  const [marking, setMarking] = useState<UpcomingBill | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await useRecurringStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    }
  }

  function billActions(bill: UpcomingBill): ActionMenuItem[] {
    const due = { ruleId: bill.ruleId, dueDate: bill.dueDate }
    const rule = rules.find(r => r.id === bill.ruleId)
    const settled = bill.status === 'PAID' || bill.status === 'SKIPPED'
    const items: ActionMenuItem[] = []
    if (!settled) {
      items.push({ id: 'paid', label: t('recurring.mark_paid_menu'), icon: 'check', onSelect: () => setMarking(bill) })
      items.push({ id: 'skip', label: t('recurring.skip'), icon: 'minus', onSelect: () => void run(() => window.api.skipBill(due)) })
    } else if (bill.paidBy !== 'AUTO') {
      items.push({ id: 'unmark', label: t('recurring.unmark'), icon: 'undo', onSelect: () => void run(() => window.api.unmarkBill(due)) })
    }
    if (bill.debtId) {
      const debtId = bill.debtId
      items.push({ id: 'debt', label: t('debts.open_debt'), icon: 'credit-card', onSelect: () => useDebtsStore.getState().openDetail(debtId) })
    } else if (rule) {
      items.push({ id: 'edit', label: t('recurring.edit'), icon: 'pencil', onSelect: () => openForm({ mode: 'edit', rule }) })
    }
    return items
  }

  const dialog = marking ? <MarkPaidDialog bill={marking} onClose={() => setMarking(null)} /> : null

  return { billActions, run, error, dialog }
}
