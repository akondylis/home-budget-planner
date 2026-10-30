// How a merchant rule matches a payee key. Shared so the Rules page can show which
// rule catches a bank text exactly as an import would.

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
export function sortRules<T extends Pick<RuleLike, 'priority' | 'accountId'>>(rules: T[]): T[] {
  return [...rules].sort((a, b) => b.priority - a.priority || Number(b.accountId !== null) - Number(a.accountId !== null))
}
