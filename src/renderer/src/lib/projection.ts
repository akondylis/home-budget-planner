// Projections page helpers. The chart scale lives in chart-scale.ts.

import type { Projection } from '../../../shared/projection'

/** Plan months that were repeated from an earlier month, for the context line: the latest one */
export function repeatedPlanMonth(p: Projection): string | null {
  const repeated = p.months.filter(m => m.planMonth !== null && m.planMonth !== m.month)
  return repeated.length > 0 ? repeated[repeated.length - 1].planMonth : null
}
