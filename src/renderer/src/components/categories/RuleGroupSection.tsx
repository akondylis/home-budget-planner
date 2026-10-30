import { useTranslation } from 'react-i18next'
import { Badge, CollapsibleCard, IconButton, MetaLine, cx } from '../ui'
import type { RuleGroup } from '../../lib/categories'
import type { RuleSummary } from '../../../../shared/statement-import'

export interface RuleGroupSectionProps {
  group: RuleGroup
  open: boolean
  onToggle: () => void
  highlightId: string | null
  onEdit: (rule: RuleSummary) => void
  onDelete: (rule: RuleSummary) => void
}

/** One category's rules, folded to its name and counts until opened */
export function RuleGroupSection({ group, open, onToggle, highlightId, onEdit, onDelete }: RuleGroupSectionProps) {
  const { t } = useTranslation()
  return (
    <CollapsibleCard
      id={`rules-${group.categoryId}`}
      open={open}
      onToggle={onToggle}
      title={group.categoryName}
      summary={[
        group.groupName,
        t('rules.section_count', { count: group.rules.length }),
        group.learnedCount > 0 && t('rules.section_yours', { count: group.learnedCount }),
        t('rules.hits', { count: group.hitTotal }),
      ].filter(Boolean).join(' · ')}
    >
      <ul className="divide-y divide-line border-t border-line">
        {group.rules.map(r => (
          <li
            key={r.id}
            id={`rule-${r.id}`}
            className={cx('flex items-center gap-3 px-4 py-2.5 transition-colors', highlightId === r.id ? 'bg-accent/10' : 'hover:bg-surface-2')}
          >
            <button
              type="button"
              onClick={() => onEdit(r)}
              className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fg-muted">{t(`rules.match_kind.${r.match}`)}</span>
                <span className="break-all font-mono font-medium text-fg">{r.pattern}</span>
                {!r.learned && <Badge tone="neutral">{t('rules.starter')}</Badge>}
              </div>
              <MetaLine
                parts={[
                  r.payee && t('rules.payee_meta', { payee: r.payee }),
                  r.accountName ?? t('rules.all_accounts'),
                  t('rules.hits', { count: r.hitCount }),
                ]}
              />
            </button>
            <IconButton icon="pencil" size="sm" label={t('rules.edit', { pattern: r.pattern })} onClick={() => onEdit(r)} />
            <IconButton icon="trash" size="sm" variant="danger" label={t('rules.delete', { pattern: r.pattern })} onClick={() => onDelete(r)} />
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  )
}
