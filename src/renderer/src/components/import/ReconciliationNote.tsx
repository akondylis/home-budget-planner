import { useTranslation } from 'react-i18next'
import { Badge, Banner } from '../ui'
import { formatDate } from '../../lib/date-format'
import { formatMoney } from '../../../../shared/money'
import type { Reconciliation } from '../../../../shared/statement-import'

/** App balance minus the bank's; 0 = they agree */
export const balanceGap = (r: Reconciliation) => r.appBalanceCents - r.statementBalanceCents

/** Short form for lists: "Matches the bank" or "Differs by €12,40" */
export function ReconciliationBadge({ reconciliation }: { reconciliation: Reconciliation }) {
  const { t } = useTranslation()
  const gap = balanceGap(reconciliation)
  return gap === 0
    ? <Badge tone="success" icon="check" title={t('import.balance_matches')}>{t('import.balance_ok')}</Badge>
    : <Badge tone="warning" icon="alert-triangle" title={explain(reconciliation, t)}>{t('import.balance_differs', { amount: formatMoney(Math.abs(gap)) })}</Badge>
}

/** After an import whose balance disagrees: what the bank says, what the app says, where to look */
export function ReconciliationBanner({ reconciliation }: { reconciliation: Reconciliation }) {
  const { t } = useTranslation()
  if (balanceGap(reconciliation) === 0) return null
  return (
    <Banner tone="warning" className="mb-3">
      {explain(reconciliation, t)}
      <span className="block text-xs font-normal">{t('import.balance_hint')}</span>
    </Banner>
  )
}

function explain(r: Reconciliation, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return t('import.balance_explain', {
    date: formatDate(r.date),
    bank: formatMoney(r.statementBalanceCents),
    app: formatMoney(r.appBalanceCents),
    amount: formatMoney(Math.abs(balanceGap(r))),
  })
}
