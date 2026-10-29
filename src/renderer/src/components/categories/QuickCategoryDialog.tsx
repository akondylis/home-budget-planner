import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, SelectMenu } from '../ui'
import { useLedgerStore } from '../../store/ledger'
import { fitsKind, type PickerKind } from '../../lib/ledger'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import type { CategoryNode } from '../../../../shared/ledger'

export interface QuickCategoryDialogProps {
  categories: CategoryNode[]
  /** Name typed in the picker's search box */
  initialName: string
  /** Which groups fit the row it is for */
  kind: PickerKind
  /** Preselected group, e.g. the one of the row's suggestion */
  groupId?: string | null
  onClose: () => void
  onCreated: (categoryId: string) => void
}

/** A new category without leaving the screen: name and group, then it is used straight away */
export function QuickCategoryDialog({ categories, initialName, kind, groupId, onClose, onCreated }: QuickCategoryDialogProps) {
  const { t } = useTranslation()
  const groups = categories.filter(g => fitsKind(g.type, kind))
  const [name, setName] = useState(initialName)
  const [parentId, setParentId] = useState<string | null>(groups.find(g => g.id === groupId)?.id ?? groups[0]?.id ?? null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) {
      setNameError(t('categories.name_required'))
      return
    }
    if (!parentId) return
    setBusy(true)
    setError(null)
    try {
      const id = await window.api.createCategory({ name: name.trim(), parentId })
      await useLedgerStore.getState().changed()
      onCreated(id)
    } catch (err) {
      if (ipcErrorCode(err) === 'CATEGORY_EXISTS') setNameError(ipcErrorMessage(err, t))
      else setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('categories.quick_title')}
      subtitle={t('categories.quick_subtitle')}
      size="sm"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-4 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="check" onClick={() => void save()} loading={busy} disabled={!parentId}>
            {t('categories.create_and_use')}
          </Button>
        </>
      }
    >
      <Field label={t('categories.category_name')} htmlFor="quick-category-name" error={nameError}>
        <Input
          id="quick-category-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={e => { setName(e.target.value); setNameError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }}
          aria-invalid={nameError ? true : undefined}
        />
      </Field>
      <Field label={t('categories.in_group')}>
        <SelectMenu
          value={parentId}
          ariaLabel={t('categories.in_group')}
          placeholder={<span className="text-fg-muted">{t('categories.choose_group')}</span>}
          options={groups.map(g => ({ value: g.id, label: `${g.name} · ${t(`categories.type.${g.type}`)}`, searchText: g.name }))}
          onChange={id => { setParentId(id); setNameError(null) }}
          triggerClassName="w-full"
        />
      </Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
