import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, ConfirmDialog, Input, ListCard, MetaLine, Segmented, Spinner } from '../ui'
import { Icon } from '../shell/icons'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { RuleForm } from './RuleForm'
import { RuleGroupSection } from './RuleGroupSection'
import { RuleTester } from './RuleTester'
import { useLedgerStore } from '../../store/ledger'
import { EMPTY_RULE_FILTER, filterRules, groupRules, type RuleFilter, type RuleOrigin } from '../../lib/categories'
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
  const [filter, setFilterState] = useState<RuleFilter>(EMPTY_RULE_FILTER)
  // Sections the user opened or folded; the rest follow the default (see sectionOpen)
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  // undefined = closed, null = a new rule
  const [editing, setEditing] = useState<RuleSummary | null | undefined>(undefined)
  const [newPattern, setNewPattern] = useState('')
  const [deleting, setDeleting] = useState<RuleSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // A rule to open, scroll to and highlight once it is in the list
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.listRules()
      .then(next => { if (alive) { setRules(next); setLoadError(null) } })
      .catch(err => { if (alive) setLoadError(ipcErrorMessage(err, t)) })
    return () => { alive = false }
  }, [revision, t])

  useEffect(() => {
    const rule = focusId ? rules?.find(r => r.id === focusId) : undefined
    if (!rule) return
    setToggled(s => ({ ...s, [rule.categoryId]: true }))
    setHighlightId(rule.id)
    setFocusId(null)
    requestAnimationFrame(() => document.getElementById(`rule-${rule.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [focusId, rules])

  function setFilter(update: (f: RuleFilter) => RuleFilter) {
    setFilterState(update)
    setToggled({})
  }

  function showRule(rule: RuleSummary) {
    if (!filterRules([rule], filter).length) setFilterState(EMPTY_RULE_FILTER)
    setFocusId(rule.id)
  }

  function addRule(pattern = '') {
    setNewPattern(pattern)
    setEditing(null)
  }

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

  const filtered = filter.query !== '' || filter.categoryId !== null || filter.origin !== 'ALL'
  const sections = groupRules(filterRules(rules, filter), categories)
  // Searching opens every section that has a hit; otherwise only the ones with the household's own rules
  const sectionOpen = (categoryId: string, learnedCount: number) => toggled[categoryId] ?? (filtered || learnedCount > 0)
  const allOpen = sections.length > 0 && sections.every(s => sectionOpen(s.categoryId, s.learnedCount))
  const learned = rules.filter(r => r.learned).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm text-fg">{t('rules.intro')}</p>
          {rules.length > 0 && (
            <MetaLine
              parts={[
                t('rules.summary_total', { count: rules.length }),
                t('rules.summary_yours', { count: learned }),
                t('rules.hits', { count: rules.reduce((sum, r) => sum + r.hitCount, 0) }),
              ]}
            />
          )}
        </div>
        <Button variant="primary" icon="plus" onClick={() => addRule()}>{t('rules.add')}</Button>
      </div>

      {notice && <Banner tone="success">{notice}</Banner>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {rules.length > 0 && <RuleTester rules={rules} onShow={showRule} onEdit={setEditing} onAddFor={addRule} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <Input
            value={filter.query}
            onChange={e => { const query = e.target.value; setFilter(f => ({ ...f, query })) }}
            placeholder={t('rules.search')}
            aria-label={t('rules.search')}
            className="w-full pl-8"
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
        {sections.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            icon={allOpen ? 'arrow-up' : 'arrow-down'}
            onClick={() => setToggled(Object.fromEntries(sections.map(s => [s.categoryId, !allOpen])))}
          >
            {allOpen ? t('rules.collapse_all') : t('rules.expand_all')}
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <ListCard><p className="px-4 py-8 text-center text-sm text-fg-muted">{t('rules.empty')}</p></ListCard>
      ) : sections.length === 0 ? (
        <ListCard>
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-fg-muted">
            <p>{t('rules.no_match')}</p>
            {filtered && <Button size="sm" icon="close" onClick={() => setFilter(() => EMPTY_RULE_FILTER)}>{t('ui.filter_clear_all')}</Button>}
          </div>
        </ListCard>
      ) : (
        <div className="space-y-2">
          {sections.map(s => (
            <RuleGroupSection
              key={s.categoryId}
              group={s}
              open={sectionOpen(s.categoryId, s.learnedCount)}
              onToggle={() => setToggled(prev => ({ ...prev, [s.categoryId]: !sectionOpen(s.categoryId, s.learnedCount) }))}
              highlightId={highlightId}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <RuleForm
          rule={editing}
          rules={rules}
          initialPattern={newPattern}
          defaultCategoryId={filter.categoryId}
          onClose={() => setEditing(undefined)}
          onSaved={(id, sorted) => {
            const isNew = editing === null
            setEditing(undefined)
            setFocusId(id)
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
