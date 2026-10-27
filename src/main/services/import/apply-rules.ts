// Category suggestions for imported rows: merchant rules first, then the
// category last used for the same payee.

import type { CategorySuggestion } from '../../../shared/statement-import'

export interface RuleLike {
  id: string
  /** Normalised, like payeeKey() */
  pattern: string
  match: 'CONTAINS' | 'STARTS_WITH' | 'EXACT'
  accountId: string | null
  categoryId: string
  payee: string | null
  priority: number
}

/** Whole words only: "ab" matches "ab vasilopoulos", not "abanti" */
export function ruleMatches(rule: Pick<RuleLike, 'pattern' | 'match'>, key: string): boolean {
  if (!rule.pattern) return false
  switch (rule.match) {
    case 'EXACT': return key === rule.pattern
    case 'STARTS_WITH': return key === rule.pattern || key.startsWith(`${rule.pattern} `)
    case 'CONTAINS': return ` ${key} `.includes(` ${rule.pattern} `)
  }
}

/** Highest priority first; on a tie a rule for this account beats a rule for all accounts */
export function sortRules<T extends RuleLike>(rules: T[]): T[] {
  return [...rules].sort((a, b) => b.priority - a.priority || Number(b.accountId !== null) - Number(a.accountId !== null))
}

/**
 * The suggestion for one row. `rules` must be sorted with sortRules();
 * `history` maps a payee key to the category last used for it.
 */
export function suggestCategory(
  key: string,
  accountId: string,
  rules: RuleLike[],
  history: Map<string, string>,
): CategorySuggestion | null {
  const rule = rules.find(r => (r.accountId === null || r.accountId === accountId) && ruleMatches(r, key))
  if (rule) return { categoryId: rule.categoryId, payee: rule.payee, source: { kind: 'rule', ruleId: rule.id, pattern: rule.pattern } }
  const last = history.get(key)
  return last ? { categoryId: last, payee: null, source: { kind: 'history' } } : null
}
