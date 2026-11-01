import { useTranslation } from 'react-i18next'
import { ActionMenu, ListCard, Money, SectionHeader, type ActionMenuItem } from '../ui'
import { BillRow } from '../recurring/BillRow'
import { formatDate } from '../../lib/date-format'
import { billKey, type Agenda, type CalendarTotals } from '../../lib/payment-calendar'
import { addDays } from '../../../../shared/date-only'
import type { UpcomingBill } from '../../../../shared/recurrence'

export interface AgendaListProps {
  agenda: Agenda
  today: string
  /** First day of this week */
  thisWeek: string
  actionsFor: (bill: UpcomingBill) => ActionMenuItem[]
}

/** Overdue on top, then week by week with what is still due and what comes in */
export function AgendaList({ agenda, today, thisWeek, actionsFor }: AgendaListProps) {
  const { t } = useTranslation()
  const rows = (bills: UpcomingBill[]) => (
    <ListCard className="divide-y divide-line">
      {bills.map(bill => (
        <BillRow
          key={billKey(bill)}
          bill={bill}
          today={today}
          actions={<ActionMenu label={t('recurring.more_for', { name: bill.name })} items={actionsFor(bill)} />}
        />
      ))}
    </ListCard>
  )

  return (
    <div className="space-y-6">
      {agenda.overdue.length > 0 && (
        <section aria-label={t('recurring.group.overdue')}>
          <SectionHeader
            title={t('recurring.group.overdue')}
            icon="alert-triangle"
            meta={t('recurring.count', { count: agenda.overdue.length })}
            amount={<Money cents={agenda.overdue.reduce((sum, b) => sum + (b.amountCents < 0 ? b.amountCents : 0), 0)} signed />}
          />
          {rows(agenda.overdue)}
        </section>
      )}
      {agenda.weeks.map(week => {
        const title = week.start === thisWeek
          ? t('calendar.this_week')
          : week.start === addDays(thisWeek, 7)
            ? t('calendar.next_week')
            : t('calendar.week_of', { from: formatDate(week.start), to: formatDate(addDays(week.start, 6)) })
        return (
          <section key={week.start} aria-label={title}>
            <SectionHeader
              title={title}
              icon="calendar"
              meta={week.start === thisWeek || week.start === addDays(thisWeek, 7)
                ? `${formatDate(week.start)} – ${formatDate(addDays(week.start, 6))}`
                : t('recurring.count', { count: week.items.length })}
              amount={<WeekAmount totals={week.totals} />}
            />
            {rows(week.items)}
          </section>
        )
      })}
    </div>
  )
}

/** "Still due −€120 · in +€1,800"; money out and in never netted */
function WeekAmount({ totals }: { totals: CalendarTotals }) {
  const { t } = useTranslation()
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-3">
      {totals.dueOut !== 0 && <span>{t('calendar.still_due')} <Money cents={totals.dueOut} signed /></span>}
      {totals.expectedIn !== 0 && <span className="text-fg-muted">{t('calendar.coming_in')} <Money cents={totals.expectedIn} signed /></span>}
      {totals.dueOut === 0 && totals.expectedIn === 0 && <span className="text-fg-muted">{t('calendar.all_settled')}</span>}
    </span>
  )
}
