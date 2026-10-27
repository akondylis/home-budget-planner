import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, ConfirmDialog, IconButton, ListCard, MetaLine, cx } from '../ui'
import { MemberDot } from './MemberDot'
import { MemberForm } from './MemberForm'
import { useLedgerStore } from '../../store/ledger'
import { useUiStore } from '../../store/ui'
import { activeMembers } from '../../lib/members'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { MemberSummary } from '../../../../shared/members'

/** Settings → Household: the parents, which one uses this PC, add / edit / archive */
export function HouseholdSection() {
  const { t } = useTranslation()
  const members = useLedgerStore(s => s.members)
  const currentMemberId = useUiStore(s => s.currentMemberId)
  // undefined = closed, null = a new parent
  const [editing, setEditing] = useState<MemberSummary | null | undefined>(undefined)
  const [archiving, setArchiving] = useState<MemberSummary | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = activeMembers(members)
  const archived = members.filter(m => m.archived)

  async function setArchived(member: MemberSummary, value: boolean) {
    setBusy(true)
    setError(null)
    try {
      await window.api.archiveMember(member.id, value)
      await useLedgerStore.getState().changed()
      setArchiving(null)
      if (!value) setJustSaved(member.id)
    } catch (err) {
      setArchiving(null)
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ListCard className="p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{t('settings.household')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('settings.household_intro')}</p>
        </div>
        <Button variant="primary" icon="user-plus" onClick={() => setEditing(null)} className="shrink-0">
          {t('members.add')}
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
          {t('members.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {active.map(m => (
            <li key={m.id} className={cx('flex items-center gap-3 px-4 py-2.5', justSaved === m.id && 'bg-accent/5')}>
              <MemberDot colour={m.colour} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{m.name}</span>
                  {m.id === currentMemberId && (
                    <Badge tone="info" icon="monitor" title={t('members.this_pc_hint')}>{t('members.this_pc')}</Badge>
                  )}
                </div>
                <MetaLine parts={[t('members.row_count', { count: m.transactionCount })]} />
              </div>
              {m.id !== currentMemberId && (
                <Button size="sm" variant="ghost" icon="user" onClick={() => useUiStore.getState().setCurrentMember(m.id)}>
                  {t('members.use_here')}
                </Button>
              )}
              <IconButton icon="pencil" size="sm" label={t('members.edit', { name: m.name })} onClick={() => setEditing(m)} />
              <IconButton icon="lock" size="sm" label={t('members.archive', { name: m.name })} onClick={() => setArchiving(m)} />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
            {t('members.archived_toggle', { count: archived.length })}
          </Button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {archived.map(m => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                  <MemberDot colour={m.colour} name={m.name} className="flex-1 text-sm text-fg-muted" />
                  <Button size="sm" icon="undo" onClick={() => void setArchived(m, false)} disabled={busy}>{t('members.restore')}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {editing !== undefined && (
        <MemberForm
          member={editing}
          onClose={() => setEditing(undefined)}
          onSaved={id => {
            setEditing(undefined)
            setJustSaved(id)
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          title={t('members.archive_title', { name: archiving.name })}
          message={t('members.archive_message')}
          confirmLabel={t('members.archive_confirm')}
          confirmIcon="lock"
          loading={busy}
          onConfirm={() => void setArchived(archiving, true)}
          onCancel={() => setArchiving(null)}
        />
      )}
    </ListCard>
  )
}
