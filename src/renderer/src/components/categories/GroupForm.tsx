import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Select } from '../ui'
import { groupRowCount } from '../../lib/categories'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import { CATEGORY_TYPES, type CategoryType, type ManagedCategoryNode } from '../../../../shared/ledger'

export interface GroupFormProps {
  /** null = a new group */
  group: ManagedCategoryNode | null
  onClose: () => void
  /** Saves and returns the group's id */
  onSave: (name: string, type: CategoryType) => Promise<string>
  onSaved: (id: string) => void
}

/** New group, or a group's name and type (the type decides how its rows count in totals) */
export function GroupForm({ group, onClose, onSave, onSaved }: GroupFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(group?.name ?? '')
  const [type, setType] = useState<CategoryType>(group?.type ?? 'EXPENSE')
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rows = group ? groupRowCount(group) : 0
  const typeChanged = group !== null && type !== group.type

  async function save() {
    if (!name.trim()) {
      setNameError(t('categories.name_required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await onSave(name.trim(), type))
    } catch (err) {
      if (ipcErrorCode(err) === 'CATEGORY_EXISTS') setNameError(ipcErrorMessage(err, t))
      else setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={group ? t('categories.edit_group_title', { name: group.name }) : t('categories.new_group')}
      size="sm"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-4 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={group ? 'check' : 'plus'} onClick={() => void save()} loading={busy}>
            {group ? t('categories.save_group') : t('categories.add_group')}
          </Button>
        </>
      }
    >
      <Field label={t('categories.group_name')} htmlFor="group-name" error={nameError}>
        <Input
          id="group-name"
          autoFocus
          value={name}
          maxLength={60}
          onChange={e => { setName(e.target.value); setNameError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }}
          aria-invalid={nameError ? true : undefined}
        />
      </Field>
      <Field
        label={t('categories.group_type')}
        htmlFor="group-type"
        hint={typeChanged && rows > 0
          ? t('categories.type_change_rows', { count: rows, type: t(`categories.type.${type}`) })
          : t('categories.group_type_hint')}
      >
        <Select id="group-type" value={type} onChange={e => setType(e.target.value as CategoryType)}>
          {CATEGORY_TYPES.map(ct => <option key={ct} value={ct}>{t(`categories.type.${ct}`)}</option>)}
        </Select>
      </Field>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
