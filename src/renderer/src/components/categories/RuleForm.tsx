import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, Segmented, Select, cx } from '../ui'
import { Icon } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { findCatchingRule, previewPattern } from '../../lib/categories'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { RuleMatch, RuleSummary } from '../../../../shared/statement-import'

const MATCHES: RuleMatch[] = ['CONTAINS', 'STARTS_WITH', 'EXACT']

export interface RuleFormProps {
  /** null = a new rule */
  rule: RuleSummary | null
  /** The other rules, to warn when one already catches this text */
  rules?: RuleSummary[]
  /** Bank text a new rule starts from (e.g. the Rules page tester) */
  initialPattern?: string
  /** Pre-selected category for a new rule (the list's filter) */
  defaultCategoryId?: string | null
  onClose: () => void
  /** `sorted` = rows still waiting that the new rule sorted */
  onSaved: (id: string, sorted: number) => void
}

/** Add or change a merchant rule, read as a sentence: when the bank text … put it in … */
export function RuleForm({ rule, rules = [], initialPattern = '', defaultCategoryId = null, onClose, onSaved }: RuleFormProps) {
  const { t } = useTranslation()
  const categories = useLedgerStore(s => s.categories)
  const accounts = activeAccounts(useLedgerStore(s => s.accounts))
  const [pattern, setPattern] = useState(rule?.pattern ?? initialPattern)
  const [match, setMatch] = useState<RuleMatch>(rule?.match ?? 'CONTAINS')
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? defaultCategoryId)
  const [payee, setPayee] = useState(rule?.payee ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? '')
  const [moreOpen, setMoreOpen] = useState(Boolean(rule?.payee || rule?.accountId))
  const [applyNow, setApplyNow] = useState(true)
  const [errors, setErrors] = useState<{ pattern?: string; categoryId?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stored = previewPattern(pattern)
  const caughtBy = stored ? findCatchingRule(rules.filter(r => r.id !== rule?.id), pattern) : null

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
      size="lg"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-5 px-6 py-5"
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
        label={t('rules.when_text')}
        htmlFor="rule-pattern"
        hint={stored ? t('rules.pattern_stored', { pattern: stored }) : t('rules.pattern_hint')}
        error={errors.pattern}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Segmented label={t('rules.match')} value={match} onChange={setMatch} options={MATCHES.map(m => ({ value: m, label: t(`rules.match_kind.${m}`) }))} />
          <Input
            id="rule-pattern"
            autoFocus
            value={pattern}
            maxLength={80}
            placeholder="ΣΚΛΑΒΕΝΙΤΗΣ"
            onChange={e => { setPattern(e.target.value); setErrors(s => ({ ...s, pattern: undefined })) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save() } }}
            aria-invalid={errors.pattern ? true : undefined}
            className="w-full min-w-0 sm:flex-1"
          />
        </div>
      </Field>
      {caughtBy && (
        <p role="status" className={cx('-mt-3 flex items-start gap-1.5 text-xs', caughtBy.learned ? 'text-amber-700' : 'text-fg-muted')}>
          <Icon name={caughtBy.learned ? 'alert-triangle' : 'info'} size={14} className="mt-px shrink-0" />
          <span>{t(caughtBy.learned ? 'rules.already_caught_yours' : 'rules.already_caught_starter', { pattern: caughtBy.pattern, category: caughtBy.categoryName })}</span>
        </p>
      )}

      <Field label={t('rules.put_in')} error={errors.categoryId}>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={id => { setCategoryId(id); setErrors(s => ({ ...s, categoryId: undefined })) }}
          kind="ANY"
          ariaLabel={t('rules.category')}
          creatable
        />
      </Field>

      <div className="border-t border-line pt-4">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="rule-more"
          onClick={() => setMoreOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-md text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          <Icon name="chevron-down" size={16} className={cx('text-fg-muted transition-transform', !moreOpen && '-rotate-90')} />
          {t('rules.more_options')}
          <span className="font-normal text-fg-muted">· {t('rules.more_options_hint')}</span>
        </button>
        {moreOpen && (
          <div id="rule-more" className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('rules.payee')} htmlFor="rule-payee" hint={t('rules.payee_hint')}>
              <Input id="rule-payee" value={payee} maxLength={120} onChange={e => setPayee(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('rules.account')} htmlFor="rule-account">
              <Select id="rule-account" value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full">
                <option value="">{t('rules.all_accounts')}</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
        )}
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
