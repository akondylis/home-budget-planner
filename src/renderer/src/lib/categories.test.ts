import { describe, expect, it } from 'vitest'
import { EMPTY_RULE_FILTER, filterRules, findCatchingRule, groupRowCount, groupRules, moveInList, previewPattern, sameTypeGroups, splitManaged, withoutCategory } from './categories'
import type { CategoryNode, ManagedCategoryNode } from '../../../shared/ledger'
import type { RuleSummary } from '../../../shared/statement-import'

function node(id: string, patch: Partial<ManagedCategoryNode> = {}): ManagedCategoryNode {
  return { id, name: id, type: 'EXPENSE', icon: null, parentId: null, sortOrder: 0, archived: false, transactionCount: 0, ruleCount: 0, children: [], ...patch }
}

function rule(id: string, patch: Partial<RuleSummary> = {}): RuleSummary {
  return { id, pattern: id, match: 'CONTAINS', accountId: null, accountName: null, categoryId: 'c1', categoryName: 'Σούπερ μάρκετ', payee: null, priority: 0, learned: false, hitCount: 0, ...patch }
}

describe('splitManaged', () => {
  it('should keep active categories in their group and list archived ones apart', () => {
    const spending = node('spending', {
      name: 'Έξοδα',
      children: [node('fuel', { parentId: 'spending' }), node('old', { parentId: 'spending', archived: true })],
    })
    const gone = node('gone', { archived: true, children: [node('inside', { parentId: 'gone', archived: true })] })
    const { groups, archived } = splitManaged([spending, gone])
    expect(groups.map(g => g.id)).toEqual(['spending'])
    expect(groups[0].children.map(c => c.id)).toEqual(['fuel'])
    // An archived group stands for its categories
    expect(archived.map(a => [a.node.id, a.groupName])).toEqual([['old', 'Έξοδα'], ['gone', null]])
  })
})

describe('moveInList', () => {
  it('should swap with the neighbour and stop at either end', () => {
    expect(moveInList(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveInList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveInList(['a', 'b'], 0, -1)).toBeNull()
    expect(moveInList(['a', 'b'], 1, 1)).toBeNull()
    expect(moveInList(['a'], -1, 1)).toBeNull()
  })
})

describe('group helpers', () => {
  it('should find the groups a group can swap with and count its rows', () => {
    const a = node('a', { children: [node('x', { transactionCount: 3 }), node('y', { transactionCount: 2 })] })
    const b = node('b', { type: 'BILL' })
    const c = node('c')
    expect(sameTypeGroups([a, b, c], a).map(g => g.id)).toEqual(['a', 'c'])
    expect(groupRowCount(a)).toBe(5)
  })

  it('should leave the merged category out of the picker', () => {
    const tree = [{ ...node('g'), children: [node('x'), node('y')] }]
    expect(withoutCategory(tree, 'x')[0].children.map(c => c.id)).toEqual(['y'])
  })
})

describe('filterRules', () => {
  const rules = [
    rule('sklavenitis', { payee: 'Σκλαβενίτης', learned: true }),
    rule('dei', { categoryId: 'c2', categoryName: 'Ρεύμα' }),
    rule('lidl'),
  ]

  it('should find rules by pattern, payee or category, ignoring accents and script', () => {
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, query: 'ΣΚΛΑΒ' }).map(r => r.id)).toEqual(['sklavenitis'])
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, query: 'ρευμα' }).map(r => r.id)).toEqual(['dei'])
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, query: 'Reum' }).map(r => r.id)).toEqual(['dei'])
    expect(filterRules(rules, EMPTY_RULE_FILTER)).toHaveLength(3)
  })

  it('should filter by category and by who made the rule', () => {
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, categoryId: 'c2' }).map(r => r.id)).toEqual(['dei'])
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, origin: 'LEARNED' }).map(r => r.id)).toEqual(['sklavenitis'])
    expect(filterRules(rules, { ...EMPTY_RULE_FILTER, origin: 'STARTER' }).map(r => r.id)).toEqual(['dei', 'lidl'])
  })
})

describe('previewPattern', () => {
  it('should show the pattern folded as it will be stored', () => {
    expect(previewPattern('ΣΚΛΑΒΕΝΙΤΗΣ')).toBe('sklavenitis')
    expect(previewPattern('   ')).toBe('')
  })
})

describe('findCatchingRule', () => {
  it('should find the rule an import would use, ignoring accents, case and script', () => {
    const rules = [rule('lidl'), rule('sklavenitis', { categoryName: 'Τρόφιμα' })]
    expect(findCatchingRule(rules, 'POS ΣΚΛΑΒΕΝΙΤΗΣ 1234')?.id).toBe('sklavenitis')
    expect(findCatchingRule(rules, 'Lidl Hellas')?.id).toBe('lidl')
  })

  it('should prefer the higher priority rule and return null when none catches the text', () => {
    const rules = [rule('low', { pattern: 'lidl' }), rule('high', { pattern: 'lidl', priority: 5 })]
    expect(findCatchingRule(rules, 'lidl')?.id).toBe('high')
    expect(findCatchingRule(rules, 'netflix')).toBeNull()
    expect(findCatchingRule(rules, '  ')).toBeNull()
  })
})

describe('groupRules', () => {
  const tree: CategoryNode[] = [
    { id: 'g1', name: 'Σπίτι', type: 'EXPENSE', icon: null, parentId: null, sortOrder: 0, children: [
      { id: 'c2', name: 'Ρεύμα', type: 'EXPENSE', icon: null, parentId: 'g1', sortOrder: 0, children: [] },
    ] },
    { id: 'g2', name: 'Έξοδα', type: 'EXPENSE', icon: null, parentId: null, sortOrder: 1, children: [
      { id: 'c1', name: 'Σούπερ μάρκετ', type: 'EXPENSE', icon: null, parentId: 'g2', sortOrder: 0, children: [] },
    ] },
  ]

  it('should follow the category order and put own rules first, then the most used', () => {
    const groups = groupRules([
      rule('lidl', { hitCount: 2 }),
      rule('ab', { hitCount: 9 }),
      rule('mine', { learned: true, hitCount: 1 }),
      rule('dei', { categoryId: 'c2', categoryName: 'Ρεύμα' }),
    ], tree)
    expect(groups.map(g => g.categoryId)).toEqual(['c2', 'c1'])
    expect(groups[1].rules.map(r => r.id)).toEqual(['mine', 'ab', 'lidl'])
    expect(groups[1]).toMatchObject({ groupName: 'Έξοδα', learnedCount: 1, hitTotal: 12 })
  })

  it('should keep rules of a category missing from the tree in a last section', () => {
    const groups = groupRules([rule('old', { categoryId: 'gone', categoryName: 'Παλιά' })], tree)
    expect(groups).toEqual([expect.objectContaining({ categoryId: 'gone', categoryName: 'Παλιά', groupName: '' })])
  })
})
