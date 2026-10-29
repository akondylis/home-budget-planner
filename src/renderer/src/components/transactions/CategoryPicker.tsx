import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SelectMenu, type SelectMenuOption } from '../ui'
import { groupsFor, type PickerKind } from '../../lib/ledger'
import type { CategoryNode } from '../../../../shared/ledger'

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
  triggerClassName?: string
  /** `compact` inside dense tables (import review, inline edit) */
  density?: 'default' | 'compact'
  /** Offers "Create «…»" when the search finds no such category; gets the typed name */
  onCreate?: (name: string) => void
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

/** Searchable category dropdown, grouped under each group's name (Bills, Spending…) */
export function CategoryPicker({
  categories,
  value,
  onChange,
  kind,
  ariaLabel,
  placeholder,
  groupsSelectable = false,
  leading = [],
  triggerClassName = 'w-full',
  density,
  onCreate,
}: CategoryPickerProps) {
  const { t } = useTranslation()
  return (
    <SelectMenu
      value={value}
      options={categoryOptions(categories, kind, groupsSelectable, leading, t)}
      onChange={onChange}
      ariaLabel={ariaLabel}
      placeholder={<span className="text-fg-muted">{placeholder ?? t('categories.choose')}</span>}
      searchable
      triggerClassName={triggerClassName}
      density={density}
      onCreate={onCreate}
      createLabel={name => t('categories.create_named', { name })}
    />
  )
}
