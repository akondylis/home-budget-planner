import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Banner, Button, EmptyCard, ListCard, Money, PageHeader, RowTitle, SectionHeader, Segmented, Spinner, StatTile, type ActionMenuItem } from '../components/ui'
import { BillRow } from '../components/recurring/BillRow'
import { MarkPaidDialog } from '../components/recurring/MarkPaidDialog'
import { SubscriptionHints } from '../components/subscriptions/SubscriptionHints'
import { useLedgerStore } from '../store/ledger'
import { useRecurringStore } from '../store/recurring'
import { formatDate } from '../lib/date-format'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { groupRules, groupUpcoming, monthlyTotals, scheduleLabel } from '../lib/recurring'
import { addDays, todayDateOnly } from '../../../shared/date-only'
import { sumMoney } from '../../../shared/money'
import type { RecurringRuleRow, UpcomingBill } from '../../../shared/recurrence'
import type { SubscriptionHint } from '../../../shared/statement-import'

type Tab = 'upcoming' | 'all'

/** Due in the tile "Next 30 days" */
const TILE_DAYS = 30

/** Subscriptions & bills: what is due soon, what is paid, and what fixed costs take each month */
export function RecurringScreen() {
  const { t } = useTranslation()
  const revision = useLedgerStore(s => s.revision)
  const dismissed = useLedgerStore(s => s.dismissedHints)
  const { rules, bills, loaded, error, load, openForm } = useRecurringStore()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [marking, setMarking] = useState<UpcomingBill | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hints, setHints] = useState<SubscriptionHint[]>([])
  const [showHints, setShowHints] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const today = todayDateOnly()

  // Reloads after every write (an import can pay a bill)
  useEffect(() => { void load() }, [load, revision])
  useEffect(() => {
    let live = true
    window.api.subscriptionHints().then(h => { if (live) setHints(h) }).catch(() => undefined)
    return () => { live = false }
  }, [revision])

  const openHints = hints.filter(h => !dismissed.includes(h.key))
  const groups = useMemo(() => groupUpcoming(bills, today), [bills, today])
  const ruleGroups = useMemo(() => groupRules(rules), [rules])
  const totals = monthlyTotals(rules)
  const tileEnd = addDays(today, TILE_DAYS)
  const dueSoon = bills.filter(b => (b.status === 'DUE' || b.status === 'UPCOMING') && b.dueDate <= tileEnd)
  const overdue = bills.filter(b => b.status === 'OVERDUE')
  const activeCount = rules.filter(r => !r.archived).length

  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try {
      await action()
      await useRecurringStore.getState().changed()
    } catch (err) {
      setActionError(ipcErrorMessage(err, t))
    }
  }

  function billActions(bill: UpcomingBill): ActionMenuItem[] {
    const due = { ruleId: bill.ruleId, dueDate: bill.dueDate }
    const rule = rules.find(r => r.id === bill.ruleId)
    const settled = bill.status === 'PAID' || bill.status === 'SKIPPED'
    const items: ActionMenuItem[] = []
    if (!settled) {
      items.push({ id: 'paid', label: t('recurring.mark_paid_menu'), icon: 'check', onSelect: () => setMarking(bill) })
      items.push({ id: 'skip', label: t('recurring.skip'), icon: 'minus', onSelect: () => void run(() => window.api.skipBill(due)) })
    } else if (bill.paidBy !== 'AUTO') {
      items.push({ id: 'unmark', label: t('recurring.unmark'), icon: 'undo', onSelect: () => void run(() => window.api.unmarkBill(due)) })
    }
    if (rule) items.push({ id: 'edit', label: t('recurring.edit'), icon: 'pencil', onSelect: () => openForm({ mode: 'edit', rule }) })
    return items
  }

  function ruleActions(rule: RecurringRuleRow): ActionMenuItem[] {
    return [
      { id: 'edit', label: t('recurring.edit'), icon: 'pencil', onSelect: () => openForm({ mode: 'edit', rule }) },
      { id: 'archive', label: t('recurring.archive'), icon: 'folder', onSelect: () => void run(() => window.api.setBillArchived(rule.id, true)) },
    ]
  }

  const hintsLink = openHints.length > 0 && (
    <Button variant="ghost" icon="repeat" onClick={() => setShowHints(true)}>{t('recurring.review_hints', { count: openHints.length })}</Button>
  )

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('nav.recurring')}
        subtitle={t('recurring.subtitle')}
        actions={<Button variant="primary" icon="plus" onClick={() => openForm()}>{t('recurring.add')}</Button>}
      />

      {error !== null && error !== undefined && <Banner tone="warning" className="mb-4">{ipcErrorMessage(error, t)}</Banner>}
      {actionError && <Banner tone="warning" className="mb-4">{actionError}</Banner>}

      {!loaded ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : activeCount === 0 && ruleGroups.archived.length === 0 ? (
        <EmptyCard icon="repeat" title={t('recurring.empty_title')} body={t('recurring.empty_body')}>
          <Button variant="primary" icon="plus" onClick={() => openForm()}>{t('recurring.add')}</Button>
          {hintsLink}
        </EmptyCard>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              icon="repeat"
              label={t('recurring.tile_monthly')}
              value={<Money cents={totals.outCents} />}
              hint={totals.inCents > 0 ? <>{t('recurring.tile_income')} <Money cents={totals.inCents} /></> : t('recurring.tile_monthly_hint', { count: activeCount })}
            />
            <StatTile
              icon="calendar"
              label={t('recurring.tile_due', { days: TILE_DAYS })}
              value={<Money cents={0 - sumMoney(dueSoon.filter(b => b.amountCents < 0).map(b => b.amountCents))} />}
              hint={t('recurring.tile_due_hint', { count: dueSoon.filter(b => b.amountCents < 0).length })}
            />
            <StatTile
              icon={overdue.length > 0 ? 'alert-triangle' : 'check'}
              label={t('recurring.tile_overdue')}
              value={<span className={overdue.length > 0 ? 'text-red-700' : undefined}>{overdue.length}</span>}
              hint={overdue.length > 0 ? t('recurring.tile_overdue_hint') : t('recurring.tile_overdue_none')}
            />
          </div>

          {openHints.length > 0 && (
            <Banner tone="info" className="mb-4" action={<Button size="sm" onClick={() => setShowHints(true)}>{t('subscriptions.review')}</Button>}>
              {t('recurring.hints_banner', { count: openHints.length })}
            </Banner>
          )}

          <div className="mb-4">
            <Segmented<Tab>
              label={t('recurring.view')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'upcoming', label: t('recurring.tab_upcoming'), icon: 'calendar' },
                { value: 'all', label: t('recurring.tab_all', { count: activeCount }), icon: 'repeat' },
              ]}
            />
          </div>

          {tab === 'upcoming' ? (
            groups.length === 0 ? (
              <EmptyCard icon="check" title={t('recurring.nothing_due_title')} body={t('recurring.nothing_due_body')} />
            ) : (
              <div className="space-y-6">
                {groups.map(group => (
                  <section key={group.key} aria-label={t(`recurring.group.${group.key}`)}>
                    <SectionHeader
                      title={t(`recurring.group.${group.key}`)}
                      icon={group.key === 'overdue' ? 'alert-triangle' : group.key === 'done' ? 'check' : 'calendar'}
                      meta={t('recurring.count', { count: group.bills.length })}
                      amount={<Money cents={groupTotal(group.bills)} signed />}
                    />
                    <ListCard className="divide-y divide-line">
                      {group.bills.map(bill => (
                        <BillRow
                          key={`${bill.ruleId}|${bill.dueDate}`}
                          bill={bill}
                          today={today}
                          actions={<ActionMenu label={t('recurring.more_for', { name: bill.name })} items={billActions(bill)} />}
                        />
                      ))}
                    </ListCard>
                  </section>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-6">
              {ruleGroups.active.map(group => (
                <section key={group.type} aria-label={t(`categories.type.${group.type}`)}>
                  <SectionHeader
                    title={t(`categories.type.${group.type}`)}
                    meta={t('recurring.count', { count: group.rules.length })}
                    amount={<>{t('recurring.per_month')} <Money cents={sumMoney(group.rules.map(r => r.monthlyCents))} /></>}
                  />
                  <ListCard className="divide-y divide-line">
                    {group.rules.map(rule => <RuleRow key={rule.id} rule={rule} actions={ruleActions(rule)} />)}
                  </ListCard>
                </section>
              ))}
              {ruleGroups.archived.length > 0 && (
                <div>
                  <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
                    {t('recurring.archived_toggle', { count: ruleGroups.archived.length })}
                  </Button>
                  {showArchived && (
                    <ListCard className="mt-2 divide-y divide-line">
                      {ruleGroups.archived.map(rule => (
                        <div key={rule.id} className="flex items-center justify-between gap-3 px-4 py-2 text-fg-muted">
                          <RowTitle title={rule.name} meta={[rule.categoryName]} />
                          <Button size="sm" icon="undo" onClick={() => void run(() => window.api.setBillArchived(rule.id, false))}>{t('recurring.restore')}</Button>
                        </div>
                      ))}
                    </ListCard>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {marking && <MarkPaidDialog bill={marking} onClose={() => setMarking(null)} />}
      {showHints && <SubscriptionHints hints={openHints} onClose={() => setShowHints(false)} />}
    </div>
  )
}

/** What a group of due dates pays out; income only when nothing in it goes out (never the two netted) */
function groupTotal(bills: UpcomingBill[]): number {
  const out = bills.filter(b => b.amountCents < 0)
  return sumMoney((out.length > 0 ? out : bills).map(b => b.amountCents))
}

/** A rule in "All bills": name, schedule and category, then next due, the amount and its monthly share */
function RuleRow({ rule, actions }: { rule: RecurringRuleRow; actions: ActionMenuItem[] }) {
  const { t } = useTranslation()
  const schedule = scheduleLabel(rule.frequency, rule.interval)
  const monthly = rule.frequency === 'MONTH' && rule.interval === 1
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_7rem_auto] items-center gap-3 px-4 py-2.5">
      <RowTitle title={rule.name} meta={[t(schedule.key, { count: schedule.count }), rule.categoryName, rule.accountName]} />
      <div className="whitespace-nowrap text-right text-sm text-fg-muted">
        {rule.nextDue ? t('recurring.next', { date: formatDate(rule.nextDue) }) : t('recurring.ended')}
      </div>
      <div className="text-right text-sm">
        <Money cents={rule.amountCents} />
        {!monthly && <div className="text-xs text-gray-500">{t('recurring.per_month')} <Money cents={rule.monthlyCents} /></div>}
      </div>
      <ActionMenu label={t('recurring.more_for', { name: rule.name })} items={actions} />
    </div>
  )
}
