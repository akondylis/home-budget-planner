// Does the app agree with the bank? A statement with a balance column says what the
// account held on its last day; after an import the app should hold the same.

export interface StatementBalance {
  /** 'yyyy-MM-dd' */
  date: string
  /** In the app's sign: money in the account > 0, a card's debt < 0 */
  cents: number
}

/**
 * The balance after the statement's last movement. Banks list newest first or oldest
 * first, so the last movement of the latest day is the last one in file order when the
 * file runs forward, else the first. Card statements print debt as a positive number,
 * so `invertSign` flips it like the amounts. null = no balance column.
 */
export function closingBalance(
  rows: { bookedAt: string | null; balanceAfterCents: number | null }[],
  invertSign: boolean,
): StatementBalance | null {
  const dated = rows.filter((r): r is { bookedAt: string; balanceAfterCents: number | null } => r.bookedAt !== null)
  const withBalance = dated.filter((r): r is { bookedAt: string; balanceAfterCents: number } => r.balanceAfterCents !== null)
  if (withBalance.length === 0) return null
  const forward = dated[0].bookedAt <= dated[dated.length - 1].bookedAt
  const latest = withBalance.reduce((max, r) => (r.bookedAt > max ? r.bookedAt : max), withBalance[0].bookedAt)
  const lastDay = withBalance.filter(r => r.bookedAt === latest)
  const row = forward ? lastDay[lastDay.length - 1] : lastDay[0]
  return { date: row.bookedAt, cents: invertSign ? -row.balanceAfterCents : row.balanceAfterCents }
}
