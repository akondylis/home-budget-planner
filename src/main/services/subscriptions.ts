// Merchants that charge the same amount every month or year, for the "looks like a
// subscription" hint. Recurring rules (roadmap #7) will take over from here.

import { prisma } from '../db/prisma'
import { dateOnlyToDate, dateToDateOnly, todayDateOnly } from '../../shared/date-only'
import { merchantText, payeeKey } from '../../shared/payee-key'
import type { SubscriptionHint } from '../../shared/statement-import'
import { detectSubscriptions } from './import/subscription-detect'

/** Far enough back for three yearly charges */
const LOOKBACK_DAYS = 3 * 366 + 31

/** `today` is passed in by tests; the app uses the real date */
export async function listSubscriptionHints(today: string = todayDateOnly()): Promise<SubscriptionHint[]> {
  const since = new Date(dateOnlyToDate(today).getTime() - LOOKBACK_DAYS * 86_400_000)
  const rows = await prisma.transaction.findMany({
    where: { amountCents: { lt: 0 }, transferId: null, bookedAt: { gte: since }, account: { archivedAt: null } },
    select: { id: true, bookedAt: true, amountCents: true, description: true, payee: true, categoryId: true, category: { select: { type: true } } },
  })
  return detectSubscriptions(
    rows.map(r => ({
      id: r.id,
      bookedAt: dateToDateOnly(r.bookedAt),
      amountCents: r.amountCents,
      key: payeeKey(r.description || r.payee || ''),
      label: r.payee || merchantText(r.description) || r.description,
      categoryId: r.categoryId,
      categoryType: r.category?.type ?? null,
    })),
    today,
  )
}
