import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Badge, Button, IconButton, ListCard, MetaLine, cx } from '../ui'
import { InlineName } from './InlineName'
import type { ManagedCategoryNode } from '../../../../shared/ledger'

/** What the Categories tab does for a group or category; the card only asks */
export interface CategoryActions {
  rename: (node: ManagedCategoryNode, name: string) => Promise<void>
  reorder: (node: ManagedCategoryNode, delta: -1 | 1) => void
  addCategory: (group: ManagedCategoryNode, name: string) => Promise<void>
  editGroup: (group: ManagedCategoryNode) => void
  move: (node: ManagedCategoryNode) => void
  merge: (node: ManagedCategoryNode) => void
  showTransactions: (node: ManagedCategoryNode) => void
  archive: (node: ManagedCategoryNode) => void
  remove: (node: ManagedCategoryNode) => void
}

export interface CategoryGroupCardProps {
  group: ManagedCategoryNode
  /** Can it swap places with the group of the same type above / below */
  canMoveUp: boolean
  canMoveDown: boolean
  highlightId: string | null
  busy: boolean
  actions: CategoryActions
}

/** One group (Bills, Spending…) with its categories, each with its counts and actions */
export function CategoryGroupCard({ group, canMoveUp, canMoveDown, highlightId, busy, actions }: CategoryGroupCardProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const last = group.children.length - 1

  return (
    <ListCard className="p-4">
      <div className={cx('mb-2 flex items-center gap-2 rounded-md', highlightId === group.id && 'bg-accent/5')}>
        <InlineName
          name={group.name}
          label={t('categories.rename', { name: group.name })}
          onSave={name => actions.rename(group, name)}
          textClassName="text-sm font-semibold text-fg"
          className="min-w-0 flex-1"
        />
        <Badge tone="neutral">{t(`categories.type.${group.type}`)}</Badge>
        <IconButton icon="arrow-up" size="sm" label={t('categories.group_up', { name: group.name })} disabled={!canMoveUp || busy} onClick={() => actions.reorder(group, -1)} />
        <IconButton icon="arrow-down" size="sm" label={t('categories.group_down', { name: group.name })} disabled={!canMoveDown || busy} onClick={() => actions.reorder(group, 1)} />
        <ActionMenu
          label={t('categories.more', { name: group.name })}
          items={[
            { id: 'type', label: t('categories.change_type'), icon: 'tag', onSelect: () => actions.editGroup(group) },
            { id: 'archive', label: t('categories.archive_group'), icon: 'lock', onSelect: () => actions.archive(group) },
            {
              id: 'delete',
              label: t('categories.delete'),
              icon: 'trash',
              danger: true,
              disabled: group.children.length > 0,
              reason: t('categories.delete_group_blocked'),
              onSelect: () => actions.remove(group),
            },
          ]}
        />
      </div>

      {group.children.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-line px-4 py-3 text-center text-sm text-fg-muted">{t('categories.group_empty')}</p>
      )}

      {group.children.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {group.children.map((c, i) => (
            <li key={c.id} className={cx('flex items-center gap-2 px-3 py-2', highlightId === c.id && 'bg-accent/5')}>
              <div className="min-w-0 flex-1">
                <InlineName
                  name={c.name}
                  label={t('categories.rename', { name: c.name })}
                  onSave={name => actions.rename(c, name)}
                  textClassName="text-sm font-medium text-fg"
                />
                <MetaLine
                  parts={[
                    c.transactionCount > 0 ? t('categories.row_count', { count: c.transactionCount }) : t('categories.no_rows'),
                    c.ruleCount > 0 && t('categories.rule_count', { count: c.ruleCount }),
                  ]}
                />
              </div>
              <IconButton icon="arrow-up" size="sm" label={t('categories.up', { name: c.name })} disabled={i === 0 || busy} onClick={() => actions.reorder(c, -1)} />
              <IconButton icon="arrow-down" size="sm" label={t('categories.down', { name: c.name })} disabled={i === last || busy} onClick={() => actions.reorder(c, 1)} />
              <ActionMenu
                label={t('categories.more', { name: c.name })}
                items={[
                  {
                    id: 'show',
                    label: t('categories.show_transactions'),
                    icon: 'receipt',
                    disabled: c.transactionCount === 0,
                    reason: t('categories.no_rows'),
                    onSelect: () => actions.showTransactions(c),
                  },
                  { id: 'move', label: t('categories.move'), icon: 'arrows-up-down', onSelect: () => actions.move(c) },
                  { id: 'merge', label: t('categories.merge'), icon: 'swap', onSelect: () => actions.merge(c) },
                  { id: 'archive', label: t('categories.archive'), icon: 'lock', onSelect: () => actions.archive(c) },
                  {
                    id: 'delete',
                    label: t('categories.delete'),
                    icon: 'trash',
                    danger: true,
                    disabled: c.transactionCount > 0,
                    reason: t('categories.delete_blocked'),
                    onSelect: () => actions.remove(c),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <InlineName
          name=""
          editing
          label={t('categories.new_category_in', { group: group.name })}
          placeholder={t('categories.new_category_placeholder')}
          onSave={async name => {
            await actions.addCategory(group, name)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
          className="mt-2"
        />
      ) : (
        <Button variant="ghost" size="sm" icon="plus" className="mt-2" onClick={() => setAdding(true)}>
          {t('categories.add_category')}
        </Button>
      )}
    </ListCard>
  )
}
