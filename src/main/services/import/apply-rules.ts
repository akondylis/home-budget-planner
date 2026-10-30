// Category suggestions for imported rows: merchant rules first, then the
// category last used for the same payee.

import type { CategorySuggestion } from '../../../shared/statement-import'
import { ruleMatches, type RuleLike } from '../../../shared/rule-match'

export { ruleMatches, sortRules, type RuleLike } from '../../../shared/rule-match'

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
