import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { categoryOptions } from './CategoryPicker'
import type { CategoryNode } from '../../../../shared/ledger'

const t = ((key: string, opts?: { group?: string }) => `${key}:${opts?.group ?? ''}`) as unknown as TFunction

const node = (id: string, name: string, children: CategoryNode[] = []): CategoryNode => ({
  id, name, type: 'EXPENSE', icon: null, parentId: null, sortOrder: 0, children,
})
const tree = [node('bills', 'Bills', [node('power', 'Power')]), node('food', 'Food', [node('market', 'Market')])]

describe('categoryOptions', () => {
  it('turns each group into a section heading over its categories', () => {
    const options = categoryOptions(tree, 'EXPENSE', false, [], t)
    expect(options.map(o => [o.value, o.kind ?? 'option'])).toEqual([
      ['bills', 'heading'], ['power', 'option'], ['food', 'heading'], ['market', 'option'],
    ])
  })

  it('makes a group a selectable, emphasised "All in" row for filters', () => {
    const [group] = categoryOptions(tree, 'EXPENSE', true, [], t)
    expect(group).toMatchObject({ value: 'bills', emphasis: true, label: 'categories.all_in_group:Bills' })
    expect(group.kind).toBeUndefined()
  })

  it('puts leading options first', () => {
    const options = categoryOptions(tree, 'EXPENSE', false, [{ value: 'link', label: 'Link' }], t)
    expect(options[0].value).toBe('link')
    expect(options[1].kind).toBe('heading')
  })
})
