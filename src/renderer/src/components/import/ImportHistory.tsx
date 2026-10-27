import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, ConfirmDialog, IconButton, ListCard, Modal, RowTitle, SelectMenu, Spinner } from '../ui'
import { ReconciliationBadge } from './ReconciliationNote'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useImportStore } from '../../store/import'
import { formatDate, formatDateTime } from '../../lib/date-format'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { ImportHistoryItem } from '../../../../shared/statement-import'

export interface ImportHistoryProps {
  /** Start with one account's imports; null = all */
  accountId: string | null
  onClose: () => void
  /** Show one import's rows in the log */
  onShowRows: (batchId: string) => void
}

/** Every import, newest first: what came in, whether the balance agrees, and Undo */
export function ImportHistory({ accountId: initialAccountId, onClose, onShowRows }: ImportHistoryProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const revision = useLedgerStore(s => s.revision)
  const [accountId, setAccountId] = useState(initialAccountId)
  const [items, setItems] = useState<ImportHistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<ImportHistoryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.listImports(accountId ?? undefined)
      .then(list => { if (alive) setItems(list) })
      .catch(err => { if (alive) setError(ipcErrorMessage(err, t)) })
    return () => { alive = false }
  }, [accountId, revision, t])

  async function undo(item: ImportHistoryItem) {
    setBusy(true)
    setError(null)
    try {
      const { removedCount } = await window.api.undoImport(item.id)
      if (useImportStore.getState().last?.batchId === item.id) useImportStore.getState().clearLast()
      setMessage(t('import.undone', { count: removedCount }))
      await useLedgerStore.getState().changed()
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
      setUndoing(null)
    }
  }

  const imported = accounts.filter(a => a.kind !== 'CASH' && (!a.archived || a.id === accountId))

  return (
    <Modal
      title={t('import.history_title')}
      onClose={onClose}
      closeDisabled={busy}
      size="xl"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.close')}</Button>
          <Button
            variant="primary"
            icon="download"
            onClick={() => useImportStore.getState().openWizard(accountId)}
            disabled={busy || activeAccounts(accounts).every(a => a.kind === 'CASH')}
          >
            {t('import.command')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <SelectMenu<string>
          value={accountId ?? ''}
          ariaLabel={t('log.account')}
          onChange={v => setAccountId(v || null)}
          options={[{ value: '', label: t('log.all_accounts') }, ...imported.map(a => ({ value: a.id, label: a.name }))]}
          triggerClassName="min-w-48"
        />
        {message && <p role="status" className="text-sm text-success-fg">{message}</p>}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}

      {!items ? (
        <div className="flex justify-center py-10 text-fg-muted"><Spinner size={20} /></div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">{t('import.history_empty')}</p>
      ) : (
        <ListCard className="divide-y divide-line">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <RowTitle
                  title={item.fileName}
                  meta={[
                    accountId ? null : item.accountName,
                    `${formatDate(item.dateFrom)}–${formatDate(item.dateTo)}`,
                    t('import.history_when', { date: formatDateTime(item.importedAt) }),
                  ]}
                />
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums text-fg">
                {t('import.history_count', { count: item.importedCount })}
              </div>
              <div className="w-48 shrink-0">
                {item.undone
                  ? <Badge tone="neutral" icon="undo">{t('import.history_undone')}</Badge>
                  : item.reconciliation && <ReconciliationBadge reconciliation={item.reconciliation} />}
              </div>
              <div className="flex shrink-0 gap-1">
                <IconButton icon="receipt" size="sm" label={t('import.history_show')} onClick={() => onShowRows(item.id)} disabled={item.undone} />
                <IconButton icon="undo" size="sm" label={t('import.undo')} onClick={() => setUndoing(item)} disabled={item.undone || busy} />
              </div>
            </div>
          ))}
        </ListCard>
      )}

      {undoing && (
        <ConfirmDialog
          title={t('import.undo_title')}
          message={t('import.undo_message', { count: undoing.importedCount })}
          confirmLabel={t('import.undo')}
          confirmIcon="undo"
          tone="danger"
          loading={busy}
          onConfirm={() => void undo(undoing)}
          onCancel={() => setUndoing(null)}
        />
      )}
    </Modal>
  )
}
