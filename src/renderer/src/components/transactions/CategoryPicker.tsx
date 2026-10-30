import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SelectMenu, cx, type SelectMenuOption } from '../ui'
import { QuickCategoryDialog } from '../categories/QuickCategoryDialog'
import { groupsFor, type PickerKind } from '../../lib/ledger'
import { transferOptions } from '../../lib/category-target'
import type { AccountSummary, CategoryNode } from '../../../../shared/ledger'

export interface CategoryPickerProps {
  categories: CategoryNode[]
  value: string | null
  onChange: (categoryId: string) => void
  /** Which groups to offer: income only, everything but income, all, or one category type */
  kind: PickerKind
  ariaLabel: string
  placeholder?: string
  /** Filter use: a group can be picked and stands for all its categories */
  groupsSelectable?: boolean
  /** Options above the groups, e.g. "All categories" */
  leading?: SelectMenuOption<string>[]
  /** Own accounts the row can move to/from instead; picked values read with `parseTarget()` */
  transferTargets?: AccountSummary[]
  /** Money coming in: transfers read "From …" */
  incoming?: boolean
  triggerClassName?: string
  /** `compact` inside dense tables (import review, inline edit) */
  density?: 'default' | 'compact'
  /** Offers "Create «…»" when the search finds no such category, then picks the new one */
  creatable?: boolean
  /** Group preselected in the create dialog, e.g. the one of a suggestion */
  createGroupId?: string | null
  /** Marks the trigger amber: the row still waits for a category */
  needsCategory?: boolean
  /** Opens the list as soon as it mounts */
  defaultOpen?: boolean
}

/** The picker's list: each group as a section heading (or a selectable "All in …" row) over its categories */
export function categoryOptions(
  categories: CategoryNode[],
  kind: PickerKind,
  groupsSelectable: boolean,
  leading: SelectMenuOption<string>[],
  t: TFunction,
): SelectMenuOption<string>[] {
  const options: SelectMenuOption<string>[] = [...leading]
  for (const group of groupsFor(categories, kind)) {
    options.push(
      groupsSelectable
        ? { value: group.id, label: t('categories.all_in_group', { group: group.name }), searchText: group.name, emphasis: true }
        : { value: group.id, label: group.name, kind: 'heading' },
    )
    for (const child of group.children) {
      options.push({
        value: child.id,
        label: child.name,
        searchText: `${child.name} ${group.name}`,
      })
    }
  }
  return options
}

/**
 * Searchable category dropdown, grouped under each group's name (Bills, Spending…). Every screen
 * that assigns a category uses it the same way: groups that fit the money's direction, transfers
 * to own accounts where the row can be one, and a new category without leaving the screen.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  kind,
  ariaLabel,
  placeholder,
  groupsSelectable = false,
  leading = [],
  transferTargets = [],
  incoming = false,
  triggerClassName = 'w-full',
  density,
  creatable = false,
  createGroupId,
  needsCategory = false,
  defaultOpen,
}: CategoryPickerProps) {
  const { t } = useTranslation()
  // A category typed in the search box that does not exist yet
  const [creating, setCreating] = useState<string | null>(null)
  return (
    <>
      <SelectMenu
        value={value}
        options={categoryOptions(categories, kind, groupsSelectable, [...leading, ...transferOptions(transferTargets, incoming, t)], t)}
        onChange={onChange}
        ariaLabel={ariaLabel}
        placeholder={<span className="text-fg-muted">{placeholder ?? t('categories.choose')}</span>}
        searchable
        triggerClassName={cx(triggerClassName, needsCategory && 'border-amber-500 text-amber-700')}
        density={density}
        onCreate={creatable ? setCreating : undefined}
        createLabel={name => t('categories.create_named', { name })}
        defaultOpen={defaultOpen}
      />
      {creating !== null && (
        <QuickCategoryDialog
          categories={categories}
          initialName={creating}
          kind={kind}
          groupId={createGroupId}
          onClose={() => setCreating(null)}
          onCreated={id => {
            setCreating(null)
            onChange(id)
          }}
        />
      )}
    </>
  )
}
