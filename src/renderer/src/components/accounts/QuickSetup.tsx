import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Field, Input, ListCard } from '../ui'
import { Icon } from '../shell/icons'
import { useLedgerStore } from '../../store/ledger'
import { ACCOUNT_KIND_ICON, QUICK_SETUP, parseAccountDraft } from '../../lib/ledger'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import { todayDateOnly } from '../../../../shared/date-only'
import type { AccountInput } from '../../../../shared/ledger'

interface Row {
  key: string
  checked: boolean
  name: string
  balance: string
}

/** First run: the household's usual accounts, pre-filled; tick, type today's balances, create */
export function QuickSetup() {
  const { t } = useTranslation()
  const dateId = useId()
  const [rows, setRows] = useState<Row[]>(() => QUICK_SETUP.map(q => ({ key: q.key, checked: true, name: t(`accounts.quick.${q.key}`), balance: '' })))
  const [date, setDate] = useState(todayDateOnly())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const parsed = rows.map((row, i) => ({
    row,
    result: parseAccountDraft({ name: row.name, kind: QUICK_SETUP[i].kind, institution: QUICK_SETUP[i].institution, openingBalance: row.balance, openingDate: date }),
  }))
  const chosen = parsed.filter(p => p.row.checked)
  const valid = chosen.every(p => 'input' in p.result)
  const update = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid || chosen.length === 0) return
    setSaving(true)
    try {
      await window.api.createAccounts(chosen.map(p => (p.result as { input: AccountInput }).input))
      await useLedgerStore.getState().changed()
    } catch (error) {
      setServerError(ipcErrorMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ListCard className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t('accounts.quick_title')}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t('accounts.quick_intro')}</p>
      <form onSubmit={onSubmit} noValidate className="mt-4">
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_10rem] items-center gap-x-3 gap-y-2">
          <span />
          <span className="section-label">{t('accounts.name')}</span>
          <span className="section-label">{t('accounts.balance_today')}</span>
          {parsed.map(({ row, result }, i) => {
            const q = QUICK_SETUP[i]
            const errors = submitted && row.checked && 'errors' in result ? result.errors : {}
            const label = t(`accounts.quick.${q.key}`)
            return (
              <div key={row.key} className="contents">
                <input type="checkbox" checked={row.checked} onChange={() => update(row.key, { checked: !row.checked })} aria-label={t('accounts.quick_include', { name: label })} />
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name={ACCOUNT_KIND_ICON[q.kind]} size={16} className="shrink-0 text-fg-muted" />
                  <Input
                    value={row.name}
                    disabled={!row.checked}
                    aria-label={t('accounts.name')}
                    aria-invalid={!!errors.name}
                    onChange={e => update(row.key, { name: e.target.value })}
                    className="w-full"
                  />
                </div>
                <Input
                  value={row.balance}
                  disabled={!row.checked}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label={q.kind === 'CASH' ? t('accounts.quick_cash_question') : t('accounts.balance_today_of', { name: row.name })}
                  title={q.kind === 'CASH' ? t('accounts.quick_cash_question') : q.kind === 'CREDIT_CARD' ? t('accounts.opening_balance_card_hint') : undefined}
                  aria-invalid={!!errors.openingBalance}
                  onChange={e => update(row.key, { balance: e.target.value })}
                  className="w-full text-right tabular-nums"
                />
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">{t('accounts.quick_hint')}</p>
        {submitted && !valid && <p role="alert" className="mt-2 text-xs text-red-700">{t('accounts.quick_fix')}</p>}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <Field label={t('accounts.balances_as_of')} htmlFor={dateId} error={submitted && !date ? t('accounts.errors.date_required') : undefined}>
            <DateInput id={dateId} value={date} onChange={setDate} invalid={submitted && !date} className="w-44" />
          </Field>
          <Button type="submit" variant="primary" icon="check" loading={saving} disabled={chosen.length === 0} title={chosen.length === 0 ? t('accounts.quick_none') : undefined}>
            {t('accounts.quick_create', { count: chosen.length })}
          </Button>
        </div>
        {serverError && <p role="alert" className="mt-2 text-sm text-red-700">{serverError}</p>}
      </form>
    </ListCard>
  )
}
