import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Field, Input, Modal, Segmented, Select } from '../ui'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { MemberDot } from '../members/MemberDot'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useRecurringStore, type RuleFormRequest } from '../../store/recurring'
import { centsToInput, findCategory } from '../../lib/ledger'
import { activeMembers } from '../../lib/members'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import {
  SCHEDULE_PRESETS,
  draftFromHint,
  draftFromRule,
  draftToInput,
  emptyDraft,
  presetFor,
  presetSchedule,
  validateDraft,
  type RuleDraft,
  type SchedulePreset,
} from '../../lib/recurring'
import { todayDateOnly } from '../../../../shared/date-only'
import { formatMoney, parseMoney } from '../../../../shared/money'
import { RECURRING_FREQUENCIES, monthlyEquivalentCents, type RecurringFrequency } from '../../../../shared/recurrence'
import { HOUSEHOLD } from '../../../../shared/members'
import { NOTIFY_LEAD_DAYS_DEFAULT, RULE_LEAD_DAY_CHOICES } from '../../../../shared/notifications'
import { leadDaysLabel } from '../../lib/notifications'

export interface BillFormProps {
  request: RuleFormRequest
  onClose: () => void
}

function initialDraft(request: RuleFormRequest): RuleDraft {
  const today = todayDateOnly()
  if (request.mode === 'edit') return draftFromRule(request.rule, centsToInput(request.rule.amountCents))
  if (request.mode === 'hint') return draftFromHint(request.hint, centsToInput(request.hint.amountCents), today)
  return emptyDraft(today)
}

/** Add or edit a bill, subscription or regular income: name and amount first, then how often */
export function BillForm({ request, onClose }: BillFormProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const categories = useLedgerStore(s => s.categories)
  const members = useLedgerStore(s => s.members)
  const editing = request.mode === 'edit' ? request.rule : null
  const ids = { name: useId(), amount: useId(), interval: useId(), anchor: useId(), ends: useId(), account: useId(), match: useId(), remind: useId(), form: useId() }
  const [draft, setDraft] = useState<RuleDraft>(() => initialDraft(request))
  // Bank text, end date, reminder and "For" are rarely needed; open when a value is already there
  const [more, setMore] = useState(() => !!(draft.endsAt || (editing && (editing.matchText || editing.remindDays !== null))))
  // The household's reminder, named in the "As in Settings" choice
  const [householdLead, setHouseholdLead] = useState(NOTIFY_LEAD_DAYS_DEFAULT)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState<number | null>(null)

  useEffect(() => {
    window.api.getSettings().then(s => { if (s) setHouseholdLead(s.notifyLeadDays) }).catch(() => {})
  }, [])

  const errors = submitted ? validateDraft(draft) : {}
  const err = (key?: string) => (key ? t(`recurring.errors.${key}`) : undefined)
  const preset = presetFor(draft.frequency, Number(draft.interval))
  const [custom, setCustom] = useState(preset === 'CUSTOM')
  const category = findCategory(categories, draft.categoryId)
  const income = category?.type === 'INCOME'
  const monthly = draft.frequency === 'MONTH' && Number(draft.interval) === 1
  const amountCents = parseMoney(draft.amount)
  const perMonth = !monthly && amountCents && amountCents > 0 && Number(draft.interval) >= 1
    ? monthlyEquivalentCents(amountCents, draft.frequency, Number(draft.interval))
    : null
  const matchText = draft.matchText.trim() || draft.name.trim()

  // Live "matches N bank rows" as the bank text changes
  useEffect(() => {
    if (!matchText) { setMatchCount(null); return }
    let live = true
    const timer = setTimeout(() => {
      window.api.countBillMatches({ matchText })
        .then(n => { if (live) setMatchCount(n) })
        .catch(() => { if (live) setMatchCount(null) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [matchText])

  function update(patch: Partial<RuleDraft>) {
    setDraft(d => ({ ...d, ...patch }))
    setServerError(null)
  }

  function pickPreset(value: SchedulePreset) {
    if (value === 'CUSTOM') { setCustom(true); return }
    setCustom(false)
    const s = presetSchedule(value)
    update({ frequency: s.frequency, interval: String(s.interval) })
  }

  const forOptions = activeMembers(members).length === 0 ? [] : [
    { value: HOUSEHOLD, label: t('members.household'), icon: 'home' as const },
    ...activeMembers(members).map(m => ({ value: m.id, label: m.name, leading: <MemberDot colour={m.colour} size="md" /> })),
  ]

  async function save(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(validateDraft(draft)).length > 0) return
    setSaving(true)
    try {
      const input = draftToInput(draft)
      if (editing) await window.api.updateBill(editing.id, input)
      else await window.api.createBill(input)
      // Coming from a hint: its past charges go into the category, as "Sort as" did
      if (request.mode === 'hint') await window.api.setCategory(request.hint.transactionIds, input.categoryId)
      if (!monthly && !income && draft.carryOver) await window.api.setCarryOver(input.categoryId, true)
      await useRecurringStore.getState().changed()
      onClose()
    } catch (error) {
      setServerError(ipcErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  const open = activeAccounts(accounts)
  const presetOptions = [...SCHEDULE_PRESETS, 'CUSTOM' as const].map(value => ({ value, label: t(`recurring.preset.${value}`) }))

  return (
    <Modal
      title={editing ? t('recurring.edit_title', { name: editing.name }) : t('recurring.add_title')}
      subtitle={request.mode === 'hint' ? t('recurring.from_hint') : undefined}
      onClose={onClose}
      closeDisabled={saving}
      size="md"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="submit" form={ids.form} variant="primary" icon="check" loading={saving}>
            {editing ? t('recurring.save') : t('recurring.add_confirm')}
          </Button>
        </>
      }
    >
      <form id={ids.form} onSubmit={e => void save(e)} className="space-y-4" noValidate>
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <Field label={t('recurring.name')} htmlFor={ids.name} required error={err(errors.name)} hint={t('recurring.name_hint')}>
            <Input id={ids.name} autoFocus autoComplete="off" value={draft.name} onChange={e => update({ name: e.target.value })} aria-invalid={!!errors.name} className="w-full" />
          </Field>
          <Field label={t('recurring.amount')} htmlFor={ids.amount} required error={err(errors.amount)}>
            <Input
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={draft.amount}
              onChange={e => update({ amount: e.target.value })}
              aria-invalid={!!errors.amount}
              className="w-full text-right tabular-nums"
            />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input type="checkbox" className="mt-0.5" checked={draft.amountVaries} onChange={e => update({ amountVaries: e.target.checked })} />
          <span>{t('recurring.amount_varies')} <span className="text-fg-muted">— {t('recurring.amount_varies_hint')}</span></span>
        </label>

        <Field label={t('recurring.category')} required error={err(errors.categoryId)}>
          <CategoryPicker
            categories={categories}
            value={draft.categoryId}
            kind="ANY"
            ariaLabel={t('recurring.category')}
            onChange={categoryId => update({ categoryId })}
            creatable
          />
        </Field>

        <Field label={t('recurring.how_often')} error={err(errors.interval)}>
          <Segmented<SchedulePreset> label={t('recurring.how_often')} value={custom ? 'CUSTOM' : preset} options={presetOptions} onChange={pickPreset} wrap />
        </Field>
        {custom && (
          <div className="flex items-center gap-2 text-sm text-fg">
            <label htmlFor={ids.interval}>{t('recurring.every_label')}</label>
            <Input
              id={ids.interval}
              inputMode="numeric"
              value={draft.interval}
              onChange={e => update({ interval: e.target.value.replace(/\D/g, '') })}
              aria-invalid={!!errors.interval}
              className="w-16 text-right tabular-nums"
            />
            <Select value={draft.frequency} onChange={e => update({ frequency: e.target.value as RecurringFrequency })} aria-label={t('recurring.unit')}>
              {RECURRING_FREQUENCIES.map(f => <option key={f} value={f}>{t(`recurring.unit_${f}`, { count: Number(draft.interval) || 1 })}</option>)}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t(editing ? 'recurring.anchor_edit' : 'recurring.anchor')} htmlFor={ids.anchor} required error={err(errors.anchorDate)} hint={t('recurring.anchor_hint')}>
            <DateInput id={ids.anchor} value={draft.anchorDate} onChange={anchorDate => update({ anchorDate })} invalid={!!errors.anchorDate} />
          </Field>
          <Field label={t(income ? 'recurring.account_in' : 'recurring.account')} htmlFor={ids.account} hint={t('recurring.account_hint')}>
            <Select id={ids.account} value={draft.accountId} onChange={e => update({ accountId: e.target.value })} className="w-full">
              <option value="">{t('recurring.any_account')}</option>
              {open.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>

        {perMonth !== null && !income && (
          <div className="rounded-md bg-surface-2 p-3 text-sm">
            <p className="text-fg">{t('recurring.provision', { amount: formatMoney(perMonth) })}</p>
            {draft.categoryId && (
              <label className="mt-2 flex items-start gap-2 text-fg">
                <input type="checkbox" className="mt-0.5" checked={draft.carryOver} onChange={e => update({ carryOver: e.target.checked })} />
                <span>{t('recurring.carry_over', { category: category?.name ?? '' })}</span>
              </label>
            )}
          </div>
        )}

        <div>
          <Button variant="ghost" size="sm" icon={more ? 'minus' : 'plus'} onClick={() => setMore(m => !m)} aria-expanded={more}>
            {t('recurring.more')}
          </Button>
          {more && (
            <div className="mt-3 space-y-4">
              <Field
                label={t('recurring.match_text')}
                htmlFor={ids.match}
                hint={matchCount === null ? t('recurring.match_hint') : t('recurring.match_count', { count: matchCount })}
              >
                <Input id={ids.match} autoComplete="off" placeholder={draft.name} value={draft.matchText} onChange={e => update({ matchText: e.target.value })} className="w-full" />
              </Field>
              <Field label={t('recurring.ends')} htmlFor={ids.ends} error={err(errors.endsAt)} hint={t('recurring.ends_hint')}>
                <DateInput id={ids.ends} value={draft.endsAt} onChange={endsAt => update({ endsAt })} invalid={!!errors.endsAt} />
              </Field>
              {/* Income is only flagged once it is late, so a lead time means nothing there */}
              {!income && (
                <Field label={t('notifications.rule.remind')} htmlFor={ids.remind} hint={t('notifications.rule.remind_hint')}>
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
            </div>
          )}
        </div>

        {serverError && <p role="alert" className="text-sm text-red-700">{serverError}</p>}
      </form>
    </Modal>
  )
}
