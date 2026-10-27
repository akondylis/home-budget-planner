import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Segmented } from '../ui'
import { MemberDot } from './MemberDot'
import { useLedgerStore } from '../../store/ledger'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import { MEMBER_COLOURS, nextFreeColour, type MemberColour, type MemberSummary } from '../../../../shared/members'

export interface MemberFormProps {
  /** null = a new parent */
  member: MemberSummary | null
  onClose: () => void
  /** The saved member's id */
  onSaved: (id: string) => void
}

/** Name and colour of a parent */
export function MemberForm({ member, onClose, onSaved }: MemberFormProps) {
  const { t } = useTranslation()
  const members = useLedgerStore(s => s.members)
  const [name, setName] = useState(member?.name ?? '')
  const [colour, setColour] = useState<MemberColour>(member?.colour ?? nextFreeColour(members))
  const [submitted, setSubmitted] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formId = useId()
  const nameId = useId()

  const blank = name.trim() === ''
  const fieldError = nameError ?? (submitted && blank ? t('members.name_required') : undefined)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (blank) return
    setSaving(true)
    try {
      const input = { name: name.trim(), colour }
      let id: string
      if (member) {
        await window.api.updateMember(member.id, input)
        id = member.id
      } else {
        id = await window.api.createMember(input)
      }
      await useLedgerStore.getState().changed()
      onSaved(id)
    } catch (err) {
      // A taken name belongs next to the name field; anything else under the form
      if (ipcErrorCode(err) === 'MEMBER_NAME_TAKEN') setNameError(ipcErrorMessage(err, t))
      else setServerError(ipcErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={member ? t('members.edit_title') : t('members.add_title')}
      onClose={onClose}
      closeDisabled={saving}
      size="sm"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" icon="check" loading={saving}>
            {member ? t('members.save') : t('members.add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t('members.name')} htmlFor={nameId} required error={fieldError} hint={t('members.name_hint')}>
          <Input
            id={nameId}
            autoFocus
            autoComplete="off"
            maxLength={40}
            value={name}
            onChange={e => {
              setName(e.target.value)
              setNameError(null)
              setServerError(null)
            }}
            aria-invalid={!!fieldError}
            className="w-full"
          />
        </Field>
        <Field label={t('members.colour')} hint={t('members.colour_hint')}>
          <Segmented<MemberColour>
            label={t('members.colour')}
            value={colour}
            onChange={setColour}
            options={MEMBER_COLOURS.map(c => ({
              value: c,
              label: t(`members.colours.${c}`),
              leading: <MemberDot colour={c} size="md" />,
            }))}
          />
        </Field>
        {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
      </form>
    </Modal>
  )
}
