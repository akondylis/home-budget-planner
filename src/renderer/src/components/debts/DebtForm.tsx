import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Field, Input, Modal, Segmented, Select, Textarea } from '../ui'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { MemberDot } from '../members/MemberDot'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useDebtsStore, type DebtFormRequest } from '../../store/debts'
import { centsToInput } from '../../lib/ledger'
import { activeMembers } from '../../lib/members'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { leadDaysLabel } from '../../lib/notifications'
import {
  draftFromDebt,
  draftHasSchedule,
  draftPreview,
  draftToDebtInput,
  emptyDebtDraft,
  validateDebtDraft,
  type DebtDraft,
  type TermMode,
} from '../../lib/debts'
import { todayDateOnly } from '../../../../shared/date-only'
import { formatMoney } from '../../../../shared/money'
import { HOUSEHOLD } from '../../../../shared/members'
import { NOTIFY_LEAD_DAYS_DEFAULT, RULE_LEAD_DAY_CHOICES } from '../../../../shared/notifications'
import { DEBT_KINDS, type DebtDirection, type DebtKind } from '../../../../shared/debt'

export interface DebtFormProps {
  request: DebtFormRequest
  onClose: () => void
}

const KIND_ICONS = { LOAN: 'bank', INSTALMENTS: 'credit-card', PERSONAL: 'users' } as const

/** Add or edit a debt: what kind first, then only that kind's fields; the instalment or the months worked out live */
export function DebtForm({ request, onClose }: DebtFormProps) {
  const { t, i18n } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const members = useLedgerStore(s => s.members)
  const institutions = useLedgerStore(s => s.institutions)
  const editing = request.mode === 'edit' ? request.debt : null
  const ids = {
    form: useId(), name: useId(), who: useId(), principal: useId(), rate: useId(), months: useId(), instalment: useId(),
    start: useId(), account: useId(), match: useId(), remind: useId(), note: useId(),
  }
  const [draft, setDraft] = useState<DebtDraft>(() =>
    editing ? draftFromDebt(editing, centsToInput, i18n.language) : emptyDebtDraft(todayDateOnly()))
  const [more, setMore] = useState(() => !!(editing && (editing.matchText || editing.remindDays !== null || editing.note)))
  const [householdLead, setHouseholdLead] = useState(NOTIFY_LEAD_DAYS_DEFAULT)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSettings().then(s => { if (s) setHouseholdLead(s.notifyLeadDays) }).catch(() => {})
  }, [])

  const errors = submitted ? validateDebtDraft(draft) : {}
  const err = (key?: string) => (key ? t(`debts.errors.${key}`) : undefined)
  const schedule = draftHasSchedule(draft)
  const preview = draftPreview(draft)
  const open = activeAccounts(accounts)
  const cards = open.filter(a => a.kind === 'CREDIT_CARD')
  const payFrom = open.filter(a => a.kind !== 'MEAL_VOUCHER')
  const banks = institutions.filter(i => i.kind === 'BANK' && (!i.archived || i.id === draft.institutionId))
  const usesMonths = draft.termMode === 'MONTHS' || draft.kind === 'INSTALMENTS'

  // A new debt's date follows its kind (the first instalment next month, or the day it was lent) until it is typed
  const [dateTouched, setDateTouched] = useState(!!editing)

  function update(patch: Partial<DebtDraft>) {
    setDraft(d => {
      const next = { ...d, ...patch }
      if (!dateTouched && !('startDate' in patch)) {
        const today = todayDateOnly()
        next.startDate = draftHasSchedule(next) ? emptyDebtDraft(today).startDate : today
      }
      return next
    })
    if ('startDate' in patch) setDateTouched(true)
    setServerError(null)
  }

  const forOptions = activeMembers(members).length === 0 ? [] : [
    { value: HOUSEHOLD, label: t('members.household'), icon: 'home' as const },
    ...activeMembers(members).map(m => ({ value: m.id, label: m.name, leading: <MemberDot colour={m.colour} size="md" /> })),
  ]

  async function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(validateDebtDraft(draft)).length > 0) return
    setSaving(true)
    try {
      const input = draftToDebtInput(draft)
      let id = editing?.id
      if (editing) await window.api.updateDebt(editing.id, input)
      else id = await window.api.createDebt(input)
      await useDebtsStore.getState().changed()
      onClose()
      // After a create, show what was made
      if (!editing && id) useDebtsStore.getState().openDetail(id)
    } catch (error) {
      setServerError(ipcErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  /** "36 × €304.22", "24 months", or the warning that it never ends */
  function previewLine(): string | null {
    if (preview.tooLow) return null
    if (usesMonths && preview.instalmentCents) return t('debts.preview_instalment', { count: preview.months ?? 0, amount: formatMoney(preview.instalmentCents) })
    if (!usesMonths && preview.months) return t('debts.preview_months', { count: preview.months })
    return null
  }

  const principalLabel = draft.kind === 'INSTALMENTS' ? 'debts.principal_total' : draft.kind === 'LOAN' ? 'debts.principal_loan' : 'debts.principal_personal'

  return (
    <Modal
      title={editing ? t('debts.edit_title', { name: editing.name }) : t('debts.add_title')}
      onClose={onClose}
      closeDisabled={saving}
      size="md"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="submit" form={ids.form} variant="primary" icon="check" loading={saving}>
            {editing ? t('debts.save') : t('debts.add_confirm')}
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={e => void save(e)} className="space-y-4" noValidate>
        <Field label={t('debts.kind_label')}>
          <Segmented<DebtKind>
            label={t('debts.kind_label')}
            value={draft.kind}
            onChange={kind => update({ kind })}
            options={DEBT_KINDS.map(k => ({ value: k, label: t(`debts.kind.${k}`), icon: KIND_ICONS[k] }))}
          />
        </Field>
        <p className="-mt-2 text-sm text-fg-muted">{t(`debts.kind_hint.${draft.kind}`)}</p>

        {draft.kind === 'PERSONAL' && (
          <Field label={t('debts.direction_label')}>
            <Segmented<DebtDirection>
              label={t('debts.direction_label')}
              value={draft.direction}
              onChange={direction => update({ direction })}
              options={[
                { value: 'WE_OWE', label: t('debts.direction.WE_OWE'), icon: 'arrow-up' },
                { value: 'OWED_TO_US', label: t('debts.direction.OWED_TO_US'), icon: 'arrow-down' },
              ]}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t(`debts.name_label.${draft.kind}`)} htmlFor={ids.name} required error={err(errors.name)}>
            <Input id={ids.name} autoFocus autoComplete="off" placeholder={t(`debts.name_placeholder.${draft.kind}`)} value={draft.name} onChange={e => update({ name: e.target.value })} aria-invalid={!!errors.name} className="w-full" />
          </Field>
          {draft.kind === 'LOAN' && (
            <Field label={t('debts.lender')} htmlFor={ids.who}>
              <Select id={ids.who} value={draft.institutionId} onChange={e => update({ institutionId: e.target.value })} className="w-full">
                <option value="">{t('debts.lender_none')}</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          {draft.kind === 'INSTALMENTS' && (
            <Field label={t('debts.card')} htmlFor={ids.who} required error={err(errors.accountId)} hint={cards.length === 0 ? t('debts.no_cards') : undefined}>
              <Select id={ids.who} value={draft.accountId} onChange={e => update({ accountId: e.target.value })} aria-invalid={!!errors.accountId} className="w-full">
                <option value="">{t('debts.choose_card')}</option>
                {cards.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          {draft.kind === 'PERSONAL' && (
            <Field label={t('debts.person')} htmlFor={ids.who}>
              <Input id={ids.who} autoComplete="off" value={draft.counterparty} onChange={e => update({ counterparty: e.target.value })} className="w-full" />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t(principalLabel)}
            htmlFor={ids.principal}
            required
            error={err(errors.principal)}
            hint={draft.kind === 'LOAN' ? t('debts.already_paying') : undefined}
          >
            <Input id={ids.principal} inputMode="decimal" autoComplete="off" placeholder="0,00" value={draft.principal} onChange={e => update({ principal: e.target.value })} aria-invalid={!!errors.principal} className="w-full text-right tabular-nums" />
          </Field>
          {draft.kind === 'LOAN' && (
            <Field label={t('debts.rate')} htmlFor={ids.rate} error={err(errors.rate)} hint={t('debts.rate_hint')}>
              <div className="flex items-center gap-2">
                <Input id={ids.rate} inputMode="decimal" autoComplete="off" placeholder="0" value={draft.rate} onChange={e => update({ rate: e.target.value })} aria-invalid={!!errors.rate} className="w-24 text-right tabular-nums" />
                <span className="text-sm text-fg-muted">%</span>
              </div>
            </Field>
          )}
        </div>

        {draft.kind === 'PERSONAL' && draft.direction === 'WE_OWE' && (
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" className="mt-0.5" checked={draft.repays} onChange={e => update({ repays: e.target.checked })} />
            <span>{t('debts.repays')} <span className="text-fg-muted">— {t('debts.repays_hint')}</span></span>
          </label>
        )}

        {schedule && (
          <div className="space-y-3 rounded-md bg-surface-2 p-3">
            {draft.kind !== 'INSTALMENTS' && (
              <Segmented<TermMode>
                label={t('debts.term_mode')}
                value={draft.termMode}
                onChange={termMode => update({ termMode })}
                options={[
                  { value: 'MONTHS', label: t('debts.term_by_months') },
                  { value: 'INSTALMENT', label: t('debts.term_by_instalment') },
                ]}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              {usesMonths ? (
                <Field label={t(draft.kind === 'INSTALMENTS' ? 'debts.instalments_count' : 'debts.months')} htmlFor={ids.months} required error={err(errors.months)}>
                  <Input id={ids.months} inputMode="numeric" autoComplete="off" value={draft.months} onChange={e => update({ months: e.target.value.replace(/\D/g, '') })} aria-invalid={!!errors.months} className="w-24 text-right tabular-nums" />
                </Field>
              ) : (
                <Field label={t('debts.instalment')} htmlFor={ids.instalment} required error={err(errors.instalment)}>
                  <Input id={ids.instalment} inputMode="decimal" autoComplete="off" placeholder="0,00" value={draft.instalment} onChange={e => update({ instalment: e.target.value })} aria-invalid={!!errors.instalment} className="w-full text-right tabular-nums" />
                </Field>
              )}
              <Field label={t('debts.first_instalment')} htmlFor={ids.start} required error={err(errors.startDate)}>
                <DateInput id={ids.start} value={draft.startDate} onChange={startDate => update({ startDate })} invalid={!!errors.startDate} />
              </Field>
            </div>
            <p className="text-sm font-medium text-fg" aria-live="polite">
              {preview.tooLow ? <span className="text-red-700">{t('debts.errors.instalment_too_low')}</span> : previewLine() ?? t('debts.preview_empty')}
            </p>
            {draft.kind !== 'INSTALMENTS' && (
              <Field label={t('debts.pay_from')} htmlFor={ids.account} hint={t('debts.pay_from_hint')}>
                <Select id={ids.account} value={draft.accountId} onChange={e => update({ accountId: e.target.value })} className="w-full">
                  <option value="">{t('debts.any_account')}</option>
                  {payFrom.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}

        {!schedule && (
          <Field label={t('debts.lent_on')} htmlFor={ids.start} required error={err(errors.startDate)}>
            <DateInput id={ids.start} value={draft.startDate} onChange={startDate => update({ startDate })} invalid={!!errors.startDate} />
          </Field>
        )}

        <div>
          <Button variant="ghost" size="sm" icon={more ? 'minus' : 'plus'} onClick={() => setMore(m => !m)} aria-expanded={more}>
            {t('debts.more')}
          </Button>
          {more && (
            <div className="mt-3 space-y-4">
              {schedule && (
                <>
                  <Field label={t('debts.category')} hint={t('debts.category_hint')}>
                    <CategoryPicker categories={categories} value={draft.categoryId} kind="DEBT" ariaLabel={t('debts.category')} onChange={categoryId => update({ categoryId })} />
                  </Field>
                  <Field label={t('recurring.match_text')} htmlFor={ids.match} hint={t('debts.match_hint')}>
                    <Input id={ids.match} autoComplete="off" placeholder={draft.name} value={draft.matchText} onChange={e => update({ matchText: e.target.value })} className="w-full" />
                  </Field>
                  <Field label={t('notifications.rule.remind')} htmlFor={ids.remind}>
                    <Select
                      id={ids.remind}
                      value={draft.remindDays === null ? '' : String(draft.remindDays)}
                      onChange={e => update({ remindDays: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-64"
                    >
                      <option value="">{t('notifications.rule.remind_default', { label: leadDaysLabel(householdLead, t) })}</option>
                      {RULE_LEAD_DAY_CHOICES.map(d => <option key={d} value={d}>{leadDaysLabel(d, t)}</option>)}
                    </Select>
                  </Field>
                </>
              )}
              {forOptions.length > 0 && (
                <Field label={t('entry.for')}>
                  <Segmented<string>
                    label={t('entry.for')}
                    value={draft.memberId ?? HOUSEHOLD}
                    onChange={value => update({ memberId: value === HOUSEHOLD ? null : value })}
                    options={forOptions}
                  />
                </Field>
              )}
              <Field label={t('entry.note')} htmlFor={ids.note}>
                <Textarea id={ids.note} rows={2} value={draft.note} onChange={e => update({ note: e.target.value })} className="w-full" />
              </Field>
            </div>
          )}
        </div>

        {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
      </form>
    </Modal>
  )
}
