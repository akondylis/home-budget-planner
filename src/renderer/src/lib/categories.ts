// Pure helpers for the Categories page: what is shown where, reordering, rule search.

import { normalise } from '../../../shared/search-normalise'
import { payeeKey } from '../../../shared/payee-key'
import type { CategoryNode, ManagedCategoryNode } from '../../../shared/ledger'
import type { RuleSummary } from '../../../shared/statement-import'

export type CategoriesTab = 'categories' | 'rules'

/** What the archive list shows: an archived group, or an archived category of an active group */
export interface ArchivedItem {
  node: ManagedCategoryNode
  /** The group's name for a category; null for a group */
  groupName: string | null
}

/** Active groups with only their active categories, and the archived ones listed apart */
export function splitManaged(tree: ManagedCategoryNode[]): { groups: ManagedCategoryNode[]; archived: ArchivedItem[] } {
  const groups: ManagedCategoryNode[] = []
  const archived: ArchivedItem[] = []
  for (const group of tree) {
    if (group.archived) {
      archived.push({ node: group, groupName: null })
      continue
    }
    groups.push({ ...group, children: group.children.filter(c => !c.archived) })
    for (const child of group.children) {
      if (child.archived) archived.push({ node: child, groupName: group.name })
    }
  }
  return { groups, archived }
}

/** The ids with the one at `index` moved one place up (-1) or down (+1); null at either end */
export function moveInList(ids: string[], index: number, delta: -1 | 1): string[] | null {
  const to = index + delta
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null
  const next = [...ids]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** Groups of the same type, in the order shown: the ones a group can swap places with */
export function sameTypeGroups(groups: ManagedCategoryNode[], group: ManagedCategoryNode): ManagedCategoryNode[] {
  return groups.filter(g => g.type === group.type)
}

/** The picker tree without one category (a category can't be merged into itself) */
export function withoutCategory(tree: CategoryNode[], id: string): CategoryNode[] {
  return tree.map(g => ({ ...g, children: g.children.filter(c => c.id !== id) }))
}

/** Rows sorted into a group's categories */
export function groupRowCount(group: ManagedCategoryNode): number {
  return group.children.reduce((sum, c) => sum + c.transactionCount, 0)
}

export type RuleOrigin = 'ALL' | 'LEARNED' | 'STARTER'

export interface RuleFilter {
  query: string
  categoryId: string | null
  origin: RuleOrigin
}

export const EMPTY_RULE_FILTER: RuleFilter = { query: '', categoryId: null, origin: 'ALL' }

/** Search ignores accents, case and Greek/Latin script, over pattern, payee and category */
export function filterRules(rules: RuleSummary[], filter: RuleFilter): RuleSummary[] {
  const words = normalise(filter.query).split(/\s+/).filter(Boolean)
  return rules.filter(r => {
    if (filter.categoryId && r.categoryId !== filter.categoryId) return false
    if (filter.origin === 'LEARNED' && !r.learned) return false
    if (filter.origin === 'STARTER' && r.learned) return false
    if (words.length === 0) return true
    const haystack = normalise(`${r.pattern} ${r.payee ?? ''} ${r.categoryName}`)
    return words.every(w => haystack.includes(w))
  })
}

/** The pattern as the main process will store it, shown under the field */
export function previewPattern(text: string): string {
  return payeeKey(text) || normalise(text).trim()
}
