import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, EmptyCard, FilterChip, MetaLine, PageHeader, Segmented, Spinner, type BannerTone } from '../components/ui'
import { MonthSwitcher, YearSwitcher } from '../components/budget/MonthSwitcher'
import { MonthGrid } from '../components/calendar/MonthGrid'
import { AgendaList } from '../components/calendar/AgendaList'
import { YearStrip } from '../components/calendar/YearStrip'
import { useBillActions } from '../components/recurring/useBillActions'
import { useLedgerStore } from '../store/ledger'
import { useRecurringStore } from '../store/recurring'
import { useUiStore, type CalendarView } from '../store/ui'
import { formatDate } from '../lib/date-format'
import { ipcErrorMessage } from '../lib/ipc-errors'
import {
  CALENDAR_STATUSES,
  ICS_MONTHS,
  buildAgenda,
  buildYear,
  calendarSummary,
  countByStatus,
  groupByDay,
  listRange,
  matchesStatus,
  monthGridRange,
  toIcsEntries,
  yearRange,
  type CalendarStatus,
} from '../lib/payment-calendar'
import { addMonths, addMonthsToDate, todayDateOnly } from '../../../shared/date-only'
import { monthOf, weekStart } from '../../../shared/calendar-grid'
import { formatMoney } from '../../../shared/money'
import { NOTIFY_LEAD_DAYS_DEFAULT } from '../../../shared/notifications'
import type { UpcomingBill } from '../../../shared/recurrence'

/** Below this window width the calendar opens on the List view */
const NARROW_WIDTH = 900

const STATUS_KEYS: Record<CalendarStatus, string> = {
  all: 'calendar.status_all',
  toPay: 'calendar.status_to_pay',
  paid: 'calendar.status_paid',
  income: 'calendar.status_income',
}

interface Notice {
  tone: BannerTone
  text: string
  filePath?: string
}

export interface CalendarScreenProps {
  onOpenRecurring: () => void
}

/** Payment calendar: bills, instalments and pay days on their dates, by month, as a list, or across the year */
export function CalendarScreen({ onOpenRecurring }: CalendarScreenProps) {
  const { t } = useTranslation()
  const revision = useLedgerStore(s => s.revision)
  const { rules, loaded: rulesLoaded, load: loadRules, openForm } = useRecurringStore()
  const { billActions, error: actionError, dialog } = useBillActions()
  const firstDay = useUiStore(s => s.weekStartsOn)
  const savedView = useUiStore(s => s.calendarView)
  const view: CalendarView = savedView ?? (window.innerWidth < NARROW_WIDTH ? 'list' : 'month')
  const setView = useUiStore(s => s.setCalendarView)
  const today = todayDateOnly()
  const month = useUiStore(s => s.calendarMonth) ?? monthOf(today)
  const setMonth = useUiStore(s => s.setCalendarMonth)
  const thisYear = Number(today.slice(0, 4))
  const year = useUiStore(s => s.calendarYear) ?? thisYear
  const setYear = useUiStore(s => s.setCalendarYear)

  const [items, setItems] = useState<UpcomingBill[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<CalendarStatus>('all')
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const range = view === 'month' ? monthGridRange(month, firstDay) : view === 'list' ? listRange(today, firstDay) : yearRange(year)

  useEffect(() => { if (!rulesLoaded) void loadRules() }, [rulesLoaded, loadRules])

  // Reloads after every write (Mark as paid here or elsewhere, an import that pays a bill)
  useEffect(() => {
    let live = true
    setLoadError(null)
    window.api.billOccurrences(range)
      .then(list => { if (live) setItems(list) })
      .catch(err => { if (live) setLoadError(ipcErrorMessage(err, t)) })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [range.from, range.to, revision])

  const visible = useMemo(() => items.filter(b => matchesStatus(b, status)), [items, status])
  const counts = countByStatus(items)
  const summary = calendarSummary(items, today)
  const activeRules = rules.filter(r => !r.archived).length

  async function handleExport() {
    setExporting(true)
    setNotice(null)
    try {
      const [future, settings] = await Promise.all([
        window.api.billOccurrences({ from: today, to: addMonthsToDate(today, ICS_MONTHS) }),
        window.api.getSettings(),
      ])
      const entries = toIcsEntries(future, today, settings?.notifyLeadDays ?? NOTIFY_LEAD_DAYS_DEFAULT, t)
      if (entries.length === 0) {
        setNotice({ tone: 'info', text: t('calendar.export_none', { months: ICS_MONTHS }) })
        return
      }
      const result = await window.api.exportCalendarIcs(entries, t('calendar.ics_name'), t('calendar.ics_file', { date: today }), t('calendar.export_title'))
      if (result.success) setNotice({ tone: 'success', text: t('calendar.exported', { count: result.count }), filePath: result.filePath })
    } catch (err) {
      setNotice({ tone: 'warning', text: ipcErrorMessage(err, t) })
    } finally {
      setExporting(false)
    }
  }

  async function openExported(filePath: string) {
    try {
      await window.api.openFile(filePath)
    } catch (err) {
      setNotice({ tone: 'warning', text: ipcErrorMessage(err, t) })
    }
  }

  const next = summary.next
  const metaParts = [
    next
      ? t('calendar.next', { name: next.name, amount: formatMoney(next.amountCents, { sign: 'exceptZero' }), date: formatDate(next.dueDate) })
      : t('calendar.nothing_next'),
    summary.overdueCount > 0 && t('calendar.overdue_count', { count: summary.overdueCount }),
  ]

  const exportDisabled = activeRules === 0

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t('nav.calendar')}
        subtitle={loaded && items.length > 0 ? <MetaLine parts={metaParts} className="text-sm" /> : t('calendar.subtitle')}
        actions={
          <Button
            icon="download"
            onClick={() => void handleExport()}
            loading={exporting}
            disabled={exportDisabled}
            title={exportDisabled ? t('calendar.export_disabled') : t('calendar.export_hint', { months: ICS_MONTHS })}
          >
            {t('calendar.export')}
          </Button>
        }
      />

      {notice && (
        <Banner
          tone={notice.tone}
          className="mb-4"
          action={notice.filePath
            ? <Button size="sm" icon="external-link" onClick={() => void openExported(notice.filePath as string)}>{t('calendar.open_file')}</Button>
            : undefined}
        >
          {notice.text}
        </Banner>
      )}
      {loadError && <Banner tone="warning" className="mb-4">{loadError}</Banner>}
      {actionError && <Banner tone="warning" className="mb-4">{actionError}</Banner>}

      {rulesLoaded && rules.length === 0 ? (
        <EmptyCard icon="calendar-days" title={t('calendar.empty_title')} body={t('calendar.empty_body')}>
          <Button variant="primary" icon="plus" onClick={() => openForm()}>{t('recurring.add')}</Button>
          <Button variant="ghost" icon="repeat" onClick={onOpenRecurring}>{t('calendar.open_bills')}</Button>
        </EmptyCard>
      ) : (
        <>
          {/* Toolbar: view, period, status */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented<CalendarView>
              label={t('calendar.view_label')}
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: t('calendar.view_month'), icon: 'calendar-days' },
                { value: 'list', label: t('calendar.view_list'), icon: 'table' },
                { value: 'year', label: t('calendar.view_year'), icon: 'chart' },
              ]}
            />
            {view === 'month' && (
              <MonthSwitcher month={month} current={monthOf(today)} onChange={delta => setMonth(addMonths(month, delta))} onToday={() => setMonth(null)} />
            )}
            {view === 'year' && (
              <YearSwitcher year={year} current={thisYear} onChange={delta => setYear(year + delta)} onToday={() => setYear(null)} />
            )}
            {view !== 'year' && (
              <div role="group" aria-label={t('calendar.status_label')} className="ml-auto flex flex-wrap gap-1.5">
                {CALENDAR_STATUSES.map(s => (
                  <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                    {t(STATUS_KEYS[s])}
                    <span className="ml-1 tabular-nums opacity-75">{counts[s]}</span>
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {!loaded ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : view === 'month' ? (
            <>
              <MonthGrid
                month={month}
                today={today}
                firstDay={firstDay}
                byDay={groupByDay(visible)}
                actionsFor={billActions}
                onMonthChange={setMonth}
              />
              {visible.length === 0 && <p className="mt-3 text-center text-sm text-fg-muted">{t(status === 'all' ? 'calendar.month_empty' : 'calendar.filter_empty')}</p>}
            </>
          ) : view === 'list' ? (
            <ListBody items={visible} today={today} firstDay={firstDay} actionsFor={billActions} filtered={status !== 'all'} />
          ) : (
            <YearStrip
              summary={buildYear(items, year)}
              today={today}
              onOpenMonth={m => { setMonth(m); setView('month') }}
            />
          )}
        </>
      )}

      {dialog}
    </div>
  )
}

interface ListBodyProps {
  items: UpcomingBill[]
  today: string
  firstDay: 0 | 1
  actionsFor: ReturnType<typeof useBillActions>['billActions']
  filtered: boolean
}

function ListBody({ items, today, firstDay, actionsFor, filtered }: ListBodyProps) {
  const { t } = useTranslation()
  const agenda = buildAgenda(items, today, firstDay)
  if (agenda.overdue.length === 0 && agenda.weeks.length === 0) {
    return <EmptyCard icon="check" title={t(filtered ? 'calendar.filter_empty' : 'calendar.list_empty_title')} body={t('calendar.list_empty_body')} />
  }
  return <AgendaList agenda={agenda} today={today} thisWeek={weekStart(today, firstDay)} actionsFor={actionsFor} />
}
