import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Banner, Button, ConfirmDialog, IconButton, Input, ListCard, MetaLine, Segmented, Spinner, cx } from '../ui'
import { Icon } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { RuleForm } from './RuleForm'
import { useLedgerStore } from '../../store/ledger'
import { EMPTY_RULE_FILTER, filterRules, type RuleFilter, type RuleOrigin } from '../../lib/categories'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { RuleSummary } from '../../../../shared/statement-import'

const ALL = '__all__'

/** Merchant rules: find the one that sorts a merchant wrongly and fix it */
export function RulesTab() {
  const { t } = useTranslation()
  const categories = useLedgerStore(s => s.categories)
  const revision = useLedgerStore(s => s.revision)
  const [rules, setRules] = useState<RuleSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RuleFilter>(EMPTY_RULE_FILTER)
  // undefined = closed, null = a new rule
  const [editing, setEditing] = useState<RuleSummary | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<RuleSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.listRules()
      .then(next => { if (alive) { setRules(next); setLoadError(null) } })
      .catch(err => { if (alive) setLoadError(ipcErrorMessage(err, t)) })
    return () => { alive = false }
  }, [revision, t])

  async function remove(rule: RuleSummary) {
    setBusy(true)
    setError(null)
    try {
      await window.api.deleteRule(rule.id)
      await useLedgerStore.getState().changed()
      setNotice(t('rules.deleted_notice', { pattern: rule.pattern }))
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setDeleting(null)
      setBusy(false)
    }
  }

  if (loadError) return <Banner tone="warning">{loadError}</Banner>
  if (!rules) return <div className="flex justify-center py-12"><Spinner /></div>

  const shown = filterRules(rules, filter)
  const filtered = filter.query !== '' || filter.categoryId !== null || filter.origin !== 'ALL'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('rules.intro')}</p>
        <Button variant="primary" icon="plus" onClick={() => setEditing(null)}>{t('rules.add')}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={filter.query}
            onChange={e => setFilter(f => ({ ...f, query: e.target.value }))}
            placeholder={t('rules.search')}
            aria-label={t('rules.search')}
            className="pl-8"
          />
        </div>
        <CategoryPicker
          categories={categories}
          value={filter.categoryId ?? ALL}
          onChange={id => setFilter(f => ({ ...f, categoryId: id === ALL ? null : id }))}
          kind="ANY"
          ariaLabel={t('rules.filter_category')}
          leading={[{ value: ALL, label: t('rules.all_categories') }]}
          triggerClassName="min-w-48"
        />
        <Segmented<RuleOrigin>
          label={t('rules.origin')}
          value={filter.origin}
          onChange={origin => setFilter(f => ({ ...f, origin }))}
          options={[
            { value: 'ALL', label: t('rules.origin_all') },
            { value: 'LEARNED', label: t('rules.origin_learned') },
            { value: 'STARTER', label: t('rules.origin_starter') },
          ]}
        />
      </div>

      {notice && <Banner tone="success">{notice}</Banner>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      <ListCard>
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{t('rules.empty')}</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-fg-muted">
            <p>{t('rules.no_match')}</p>
            {filtered && <Button size="sm" icon="close" onClick={() => setFilter(EMPTY_RULE_FILTER)}>{t('ui.filter_clear_all')}</Button>}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map(r => (
              <li key={r.id} className={cx('flex items-center gap-3 px-4 py-2.5', highlightId === r.id && 'bg-accent/5')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="break-all font-mono text-fg">{r.pattern}</span>
                    <Icon name="arrow-right" size={14} className="shrink-0 text-gray-500" />
                    <span className="font-medium text-fg">{r.categoryName}</span>
                    {!r.learned && <Badge tone="neutral">{t('rules.starter')}</Badge>}
                  </div>
                  <MetaLine
                    parts={[
                      t(`rules.match_kind.${r.match}`),
                      r.payee && t('rules.payee_meta', { payee: r.payee }),
                      r.accountName ?? t('rules.all_accounts'),
                      t('rules.hits', { count: r.hitCount }),
                    ]}
                  />
                </div>
                <IconButton icon="pencil" size="sm" label={t('rules.edit', { pattern: r.pattern })} onClick={() => setEditing(r)} />
                <IconButton icon="trash" size="sm" variant="danger" label={t('rules.delete', { pattern: r.pattern })} onClick={() => setDeleting(r)} />
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      {editing !== undefined && (
        <RuleForm
          rule={editing}
          defaultCategoryId={filter.categoryId}
          onClose={() => setEditing(undefined)}
          onSaved={(id, sorted) => {
            const isNew = editing === null
            setEditing(undefined)
            setHighlightId(id)
            setNotice(isNew ? t('rules.added_notice', { count: sorted }) : t('rules.saved_notice'))
            void useLedgerStore.getState().changed()
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('rules.delete_title', { pattern: deleting.pattern })}
          message={t('rules.delete_message')}
          confirmLabel={t('rules.delete_confirm')}
          tone="danger"
          loading={busy}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
