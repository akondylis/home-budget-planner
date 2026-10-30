// Pure helpers for the Categories page: what is shown where, reordering, rule search.

import { normalise } from '../../../shared/search-normalise'
import { payeeKey } from '../../../shared/payee-key'
import { ruleMatches, sortRules } from '../../../shared/rule-match'
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

/** The rule an import would use for this bank text (accounts aside), or null when none catches it */
export function findCatchingRule(rules: RuleSummary[], text: string): RuleSummary | null {
  const key = previewPattern(text)
  if (!key) return null
  return sortRules(rules).find(r => ruleMatches(r, key)) ?? null
}

/** One section of the Rules page: the rules that sort into one category */
export interface RuleGroup {
  categoryId: string
  categoryName: string
  /** The category's group, e.g. "Spending"; empty when the category is no longer listed */
  groupName: string
  rules: RuleSummary[]
  learnedCount: number
  hitTotal: number
}

/**
 * Rules by category, in the order of the category tree. Inside a section the household's own
 * rules come first, then the most used ones.
 */
export function groupRules(rules: RuleSummary[], categories: CategoryNode[]): RuleGroup[] {
  const byCategory = new Map<string, RuleSummary[]>()
  for (const r of rules) byCategory.set(r.categoryId, [...(byCategory.get(r.categoryId) ?? []), r])

  const section = (categoryId: string, categoryName: string, groupName: string, list: RuleSummary[]): RuleGroup => ({
    categoryId,
    categoryName,
    groupName,
    rules: [...list].sort((a, b) => Number(b.learned) - Number(a.learned) || b.hitCount - a.hitCount || a.pattern.localeCompare(b.pattern)),
    learnedCount: list.filter(r => r.learned).length,
    hitTotal: list.reduce((sum, r) => sum + r.hitCount, 0),
  })

  const groups: RuleGroup[] = []
  for (const group of categories) {
    for (const child of group.children) {
      const list = byCategory.get(child.id)
      if (!list) continue
      groups.push(section(child.id, child.name, group.name, list))
      byCategory.delete(child.id)
    }
  }
  // Categories missing from the tree (e.g. archived) still show their rules, last
  for (const [categoryId, list] of byCategory) groups.push(section(categoryId, list[0].categoryName, '', list))
  return groups
}
