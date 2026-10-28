import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Modal, SelectMenu } from '../ui'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import type { ManagedCategoryNode } from '../../../../shared/ledger'

export interface MoveCategoryDialogProps {
  category: ManagedCategoryNode
  /** Active groups, in the order shown */
  groups: ManagedCategoryNode[]
  onClose: () => void
  onMoved: (id: string) => void
  /** The target group already has this name: offer to merge instead */
  onMergeInstead: (category: ManagedCategoryNode) => void
}

/** Puts a category in another group; it takes that group's type */
export function MoveCategoryDialog({ category, groups, onClose, onMoved, onMergeInstead }: MoveCategoryDialogProps) {
  const { t } = useTranslation()
  const current = groups.find(g => g.id === category.parentId) ?? null
  const [targetId, setTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clash, setClash] = useState(false)
  const [busy, setBusy] = useState(false)
  const target = groups.find(g => g.id === targetId) ?? null

  async function move() {
    if (!targetId) return
    setBusy(true)
    setError(null)
    setClash(false)
    try {
      await window.api.moveCategory(category.id, targetId)
      onMoved(category.id)
    } catch (err) {
      setClash(ipcErrorCode(err) === 'CATEGORY_EXISTS')
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const typeHint = target && target.type !== category.type
    ? t('categories.move_type_change', {
        count: category.transactionCount,
        from: t(`categories.type.${category.type}`),
        to: t(`categories.type.${target.type}`),
      })
    : undefined

  return (
    <Modal
      title={t('categories.move_title', { name: category.name })}
      subtitle={current ? t('categories.now_in', { group: current.name }) : undefined}
      size="sm"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-4 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="arrows-up-down" onClick={() => void move()} loading={busy} disabled={!targetId}>
            {target ? t('categories.move_to', { group: target.name }) : t('categories.move_button')}
          </Button>
        </>
      }
    >
      <Field label={t('categories.target_group')} hint={typeHint}>
        <SelectMenu
          value={targetId}
          ariaLabel={t('categories.target_group')}
          placeholder={<span className="text-fg-muted">{t('categories.choose_group')}</span>}
          options={groups
            .filter(g => g.id !== category.parentId)
            .map(g => ({ value: g.id, label: `${g.name} · ${t(`categories.type.${g.type}`)}`, searchText: g.name }))}
          onChange={id => { setTargetId(id); setError(null); setClash(false) }}
          triggerClassName="w-full"
        />
      </Field>
      {error && (
        <div role="alert" className="space-y-2 text-sm text-red-700">
          <p>{error}</p>
          {clash && (
            <Button size="sm" icon="swap" onClick={() => onMergeInstead(category)}>{t('categories.merge_instead')}</Button>
          )}
        </div>
      )}
    </Modal>
  )
}
