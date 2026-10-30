import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ListCard, Modal, RowTitle } from '../ui'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { useLedgerStore } from '../../store/ledger'
import { useRecurringStore } from '../../store/recurring'
import { findCategory } from '../../lib/ledger'
import { formatDate } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { formatMoney } from '../../../../shared/money'
import type { SubscriptionHint } from '../../../../shared/statement-import'

export interface SubscriptionHintsProps {
  hints: SubscriptionHint[]
  onClose: () => void
}

/** "Looks like a subscription": track it as a bill, only sort it under Subscriptions, or say it is not one */
export function SubscriptionHints({ hints, onClose }: SubscriptionHintsProps) {
  const { t } = useTranslation()
  const categories = useLedgerStore(s => s.categories)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function sort(hint: SubscriptionHint, categoryId: string) {
    setBusy(hint.key)
    setError(null)
    try {
      await window.api.setCategory(hint.transactionIds, categoryId)
      // Future charges from the same merchant go there too
      await window.api.createRule({ pattern: hint.label, categoryId, applyToUncategorised: true })
      setDone(t('subscriptions.sorted', { name: hint.label, category: findCategory(categories, categoryId)?.name ?? '' }))
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      title={t('subscriptions.hints_title')}
      subtitle={t('subscriptions.hints_subtitle')}
      onClose={onClose}
      closeDisabled={busy !== null}
      size="wide"
      footer={<Button variant="ghost" icon="close" onClick={onClose} disabled={busy !== null}>{t('common.close')}</Button>}
    >
      {done && <p role="status" className="mb-3 text-sm text-success-fg">{done}</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {hints.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">{t('subscriptions.hints_empty')}</p>
      ) : (
        <ListCard className="divide-y divide-line">
          {hints.map(hint => (
            <div key={hint.key} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <RowTitle
                  title={hint.label}
                  meta={[
                    t(`subscriptions.every_${hint.interval}`, { amount: formatMoney(hint.amountCents) }),
                    t('subscriptions.times', { count: hint.count }),
                    t('subscriptions.last', { date: formatDate(hint.lastDate) }),
                  ]}
                />
              </div>
              <Button
                size="sm"
                icon="repeat"
                title={t('recurring.track_hint')}
                onClick={() => {
                  // The bill form (mounted by App) opens over the page once this list closes
                  useRecurringStore.getState().openForm({ mode: 'hint', hint })
                  onClose()
                }}
                disabled={busy !== null}
              >
                {t('recurring.track')}
              </Button>
              <div className="w-52 shrink-0">
                <CategoryPicker
                  categories={categories}
                  value={null}
                  kind="SUBSCRIPTION"
                  ariaLabel={t('subscriptions.sort_as', { name: hint.label })}
                  placeholder={t('subscriptions.sort_placeholder')}
                  onChange={id => void sort(hint, id)}
                  creatable
                  triggerClassName="h-8 w-full text-xs"
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => useLedgerStore.getState().dismissHint(hint.key)} disabled={busy !== null}>
                {t('subscriptions.not_one')}
              </Button>
            </div>
          ))}
        </ListCard>
      )}
    </Modal>
  )
}
