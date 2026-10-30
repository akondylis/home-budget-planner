import { useTranslation } from 'react-i18next'
import { Icon } from '../shell/icons'
import { Button, ListCard } from '../ui'
import { BillRow } from '../recurring/BillRow'
import { useRecurringStore } from '../../store/recurring'
import { todayDateOnly } from '../../../../shared/date-only'
import { UPCOMING_DAYS, type OverviewMonth } from '../../../../shared/overview'

/** Rows the card shows before "and N more" */
const MAX_ROWS = 5

export interface UpcomingBillsCardProps {
  /** null while the first load runs */
  data: OverviewMonth | null
  /** The Subscriptions & bills page */
  onOpen: () => void
}

/** Overdue and soon-due bills, oldest first; each row and "See all" open the bills page */
export function UpcomingBillsCard({ data, onOpen }: UpcomingBillsCardProps) {
  const { t } = useTranslation()
  const today = todayDateOnly()
  const bills = data?.upcoming ?? []
  const shown = bills.slice(0, MAX_ROWS)
  const rest = bills.length - shown.length

  return (
    <ListCard className="min-w-0">
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
          <Icon name="calendar" size={16} />
        </span>
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-fg">{t('overview.upcoming')}</h2>
        {data?.hasRules && <Button size="sm" variant="ghost" icon="arrow-right" onClick={onOpen}>{t('overview.upcoming_all')}</Button>}
      </div>
      {data === null ? null : !data.hasRules ? (
        <div className="px-4 pb-4">
          <p className="text-sm text-fg-muted">{t('overview.upcoming_empty')}</p>
          <Button size="sm" className="mt-3" icon="plus" onClick={() => { onOpen(); useRecurringStore.getState().openForm() }}>
            {t('overview.upcoming_add')}
          </Button>
        </div>
      ) : bills.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-fg-muted">{t('overview.upcoming_none', { days: UPCOMING_DAYS })}</p>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {shown.map(bill => <BillRow key={`${bill.ruleId}|${bill.dueDate}`} bill={bill} today={today} onOpen={onOpen} compact />)}
          {rest > 0 && (
            <button type="button" onClick={onOpen} className="block w-full px-4 py-2 text-left text-sm text-accent hover:underline">
              {t('overview.upcoming_more', { count: rest })}
            </button>
          )}
        </div>
      )}
    </ListCard>
  )
}
