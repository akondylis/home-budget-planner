import { useTranslation } from 'react-i18next'
import { SelectMenu, type SelectMenuOption } from '../ui'
import { groupsFor } from '../../lib/ledger'
import type { CategoryNode } from '../../../../shared/ledger'

export interface CategoryPickerProps {
  categories: CategoryNode[]
  value: string | null
  onChange: (categoryId: string) => void
  /** Which groups to offer: income only, everything but income, or all */
  kind: 'EXPENSE' | 'INCOME' | 'ANY'
  ariaLabel: string
  placeholder?: string
  /** Filter use: a group can be picked and stands for all its categories */
  groupsSelectable?: boolean
  /** Options above the groups, e.g. "All categories" */
  leading?: SelectMenuOption<string>[]
  triggerClassName?: string
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
}: CategoryPickerProps) {
  const { t } = useTranslation()
  const options: SelectMenuOption<string>[] = [...leading]
  for (const group of groupsFor(categories, kind)) {
    options.push({
      value: group.id,
      label: groupsSelectable
        ? t('categories.all_in_group', { group: group.name })
        : <span className="section-label">{group.name}</span>,
      searchText: group.name,
      disabled: !groupsSelectable,
    })
    for (const child of group.children) {
      options.push({
        value: child.id,
        label: child.name,
        searchText: `${child.name} ${group.name}`,
      })
    }
  }

  return (
    <SelectMenu
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      placeholder={<span className="text-fg-muted">{placeholder ?? t('categories.choose')}</span>}
      searchable
      triggerClassName={triggerClassName}
    />
  )
}
