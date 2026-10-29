import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ConfirmDialog, IconButton, ListCard, MetaLine, cx } from '../ui'
import { Icon } from '../shell/icons'
import { BankForm } from './BankForm'
import { useLedgerStore } from '../../store/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { InstitutionSummary } from '../../../../shared/ledger'

/** Anchor the Ctrl+K "Manage banks" command scrolls to */
export const BANKS_SECTION_ID = 'settings-banks'

/** Settings → Banks: the banks and meal-card issuers offered for accounts; add, rename, reorder, archive */
export function BanksSection() {
  const { t } = useTranslation()
  const institutions = useLedgerStore(s => s.institutions)
  // undefined = closed, null = a new bank
  const [editing, setEditing] = useState<InstitutionSummary | null | undefined>(undefined)
  const [archiving, setArchiving] = useState<InstitutionSummary | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = institutions.filter(i => !i.archived)
  const archived = institutions.filter(i => i.archived)

  async function run(action: () => Promise<unknown>, savedId?: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await useLedgerStore.getState().changed()
      setArchiving(null)
      if (savedId) setJustSaved(savedId)
    } catch (err) {
      setArchiving(null)
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id={BANKS_SECTION_ID} aria-label={t('settings.banks')} className="scroll-mt-4">
      <ListCard className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">{t('settings.banks')}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t('settings.banks_intro')}</p>
          </div>
          <Button icon="plus" onClick={() => setEditing(null)} className="shrink-0">{t('banks.add')}</Button>
        </div>

        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">{t('banks.empty')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {active.map((b, index) => (
              <li key={b.id} className={cx('flex items-center gap-3 px-4 py-2', justSaved === b.id && 'bg-accent/5')}>
                <Icon name={b.kind === 'BANK' ? 'bank' : 'utensils'} size={16} className="shrink-0 text-gray-500" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{b.name}</div>
                  <MetaLine parts={[b.kind === 'VOUCHER_ISSUER' && t('banks.kind.VOUCHER_ISSUER'), t('banks.account_count', { count: b.accountCount })]} />
                </div>
                <IconButton
                  icon="arrow-up"
                  size="sm"
                  label={t('banks.move_up', { name: b.name })}
                  onClick={() => void run(() => window.api.moveInstitution(b.id, 'up'), b.id)}
                  disabled={busy || index === 0}
                />
                <IconButton
                  icon="arrow-down"
                  size="sm"
                  label={t('banks.move_down', { name: b.name })}
                  onClick={() => void run(() => window.api.moveInstitution(b.id, 'down'), b.id)}
                  disabled={busy || index === active.length - 1}
                />
                <IconButton icon="pencil" size="sm" label={t('banks.edit', { name: b.name })} onClick={() => setEditing(b)} />
                <IconButton icon="lock" size="sm" label={t('banks.archive', { name: b.name })} onClick={() => setArchiving(b)} />
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="mt-4">
            <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
              {t('banks.archived_toggle', { count: archived.length })}
            </Button>
            {showArchived && (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {archived.map(b => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-1 text-sm text-fg-muted">{b.name}</span>
                    <Button size="sm" icon="undo" onClick={() => void run(() => window.api.archiveInstitution(b.id, false), b.id)} disabled={busy}>
                      {t('banks.restore')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

        {editing !== undefined && (
          <BankForm
            bank={editing}
            onClose={() => setEditing(undefined)}
            onSaved={id => {
              setEditing(undefined)
              setJustSaved(id)
            }}
          />
        )}
        {archiving && (
          <ConfirmDialog
            title={t('banks.archive_title', { name: archiving.name })}
            message={t('banks.archive_message')}
            confirmLabel={t('banks.archive_confirm')}
            confirmIcon="lock"
            loading={busy}
            onConfirm={() => void run(() => window.api.archiveInstitution(archiving.id))}
            onCancel={() => setArchiving(null)}
          />
        )}
      </ListCard>
    </section>
  )
}
