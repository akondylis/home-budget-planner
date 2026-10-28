import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Segmented, Select } from '../ui'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { previewPattern } from '../../lib/categories'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { RuleMatch, RuleSummary } from '../../../../shared/statement-import'

const MATCHES: RuleMatch[] = ['CONTAINS', 'STARTS_WITH', 'EXACT']

export interface RuleFormProps {
  /** null = a new rule */
  rule: RuleSummary | null
  /** Pre-selected category for a new rule (the list's filter) */
  defaultCategoryId?: string | null
  onClose: () => void
  /** `sorted` = rows still waiting that the new rule sorted */
  onSaved: (id: string, sorted: number) => void
}

/** Add or change a merchant rule: which bank text, which category, which accounts */
export function RuleForm({ rule, defaultCategoryId = null, onClose, onSaved }: RuleFormProps) {
  const { t } = useTranslation()
  const categories = useLedgerStore(s => s.categories)
  const accounts = activeAccounts(useLedgerStore(s => s.accounts))
  const [pattern, setPattern] = useState(rule?.pattern ?? '')
  const [match, setMatch] = useState<RuleMatch>(rule?.match ?? 'CONTAINS')
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? defaultCategoryId)
  const [payee, setPayee] = useState(rule?.payee ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? '')
  const [applyNow, setApplyNow] = useState(true)
  const [errors, setErrors] = useState<{ pattern?: string; categoryId?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stored = previewPattern(pattern)

  async function save() {
    const next = {
      pattern: !stored ? t('rules.pattern_required') : undefined,
      categoryId: !categoryId ? t('error.CATEGORY_REQUIRED') : undefined,
    }
    setErrors(next)
    if (next.pattern || next.categoryId || !categoryId) return
    setBusy(true)
    setError(null)
    const input = { pattern, match, categoryId, payee: payee.trim() || null, accountId: accountId || null }
    try {
      if (rule) {
        await window.api.updateRule(rule.id, input)
        onSaved(rule.id, 0)
      } else {
        const { id, appliedCount } = await window.api.createRule({ ...input, applyToUncategorised: applyNow })
        onSaved(id, appliedCount)
      }
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={rule ? t('rules.edit_title', { pattern: rule.pattern }) : t('rules.add')}
      size="md"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-4 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={rule ? 'check' : 'plus'} onClick={() => void save()} loading={busy}>
            {rule ? t('rules.save') : t('rules.add')}
          </Button>
        </>
      }
    >
      <Field
        label={t('rules.pattern')}
        htmlFor="rule-pattern"
        hint={stored ? t('rules.pattern_stored', { pattern: stored }) : t('rules.pattern_hint')}
        error={errors.pattern}
      >
        <Input
          id="rule-pattern"
          autoFocus
          value={pattern}
          maxLength={80}
          placeholder="ΣΚΛΑΒΕΝΙΤΗΣ"
          onChange={e => { setPattern(e.target.value); setErrors(s => ({ ...s, pattern: undefined })) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }}
          aria-invalid={errors.pattern ? true : undefined}
        />
      </Field>
      <Field label={t('rules.match')}>
        <Segmented label={t('rules.match')} value={match} onChange={setMatch} options={MATCHES.map(m => ({ value: m, label: t(`rules.match_kind.${m}`) }))} />
      </Field>
      <Field label={t('rules.category')} error={errors.categoryId}>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={id => { setCategoryId(id); setErrors(s => ({ ...s, categoryId: undefined })) }}
          kind="ANY"
          ariaLabel={t('rules.category')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('rules.payee')} htmlFor="rule-payee" hint={t('rules.payee_hint')}>
          <Input id="rule-payee" value={payee} maxLength={120} onChange={e => setPayee(e.target.value)} />
        </Field>
        <Field label={t('rules.account')} htmlFor="rule-account">
          <Select id="rule-account" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">{t('rules.all_accounts')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      {!rule && (
        <label className="flex items-start gap-2 text-sm text-fg">
          <input type="checkbox" className="mt-0.5" checked={applyNow} onChange={e => setApplyNow(e.target.checked)} />
          {t('rules.apply_now')}
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
