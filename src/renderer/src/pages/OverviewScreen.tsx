import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/shell/icons'
import { Banner, Button, ListCard, PageHeader } from '../components/ui'
import { OverviewBanners } from '../components/overview/OverviewBanners'
import { OverviewTiles } from '../components/overview/OverviewTiles'
import { useLedgerStore } from '../store/ledger'
import { currentMonth } from '../store/transactions'
import { activeMembers } from '../lib/members'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { accountTotals, type OverviewMonth } from '../../../shared/overview'
import type { View } from '../types'

type SetupKey = 'members' | 'accounts' | 'categories' | 'budget'

const SETUP_STEPS: { key: SetupKey; icon: IconName }[] = [
  { key: 'members', icon: 'users' },
  { key: 'accounts', icon: 'bank' },
  { key: 'categories', icon: 'tag' },
  { key: 'budget', icon: 'target' },
]

export interface OverviewScreenProps {
  onPrintWorksheet: () => void
  onGoTo: (view: View) => void
  /** The log filtered to a month */
  onShowMonth: (month: string) => void
  onShowUncategorised: (month: string) => void
  /** The Budget page on a month */
  onOpenBudget: (month: string) => void
  onManageCategories: () => void
}

export function OverviewScreen({ onPrintWorksheet, onGoTo, onShowMonth, onShowUncategorised, onOpenBudget, onManageCategories }: OverviewScreenProps) {
  const { t, i18n } = useTranslation()
  const month = currentMonth()
  const revision = useLedgerStore(s => s.revision)
  const accounts = useLedgerStore(s => s.accounts)
  const hasMembers = useLedgerStore(s => activeMembers(s.members).length > 0)
  const hasCategories = useLedgerStore(s => s.categories.some(g => g.children.length > 0))
  const totals = useMemo(() => accountTotals(accounts), [accounts])
  const [data, setData] = useState<OverviewMonth | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  // Reloads after every write (a transaction saved from Ctrl+N, an import…)
  useEffect(() => {
    let live = true
    window.api.getOverview(month)
      .then(next => { if (live) { setData(next); setError(null) } })
      .catch(err => { if (live) setError(err) })
    return () => { live = false }
  }, [month, revision, attempt])

  const done: Record<SetupKey, boolean> = {
    members: hasMembers,
    accounts: totals.count > 0,
    categories: hasCategories,
    budget: (data?.budget.exists || data?.budget.previousHasPlan) ?? false,
  }
  const goTo: Record<SetupKey, () => void> = {
    members: () => onGoTo('settings'),
    accounts: () => onGoTo('accounts'),
    categories: onManageCategories,
    budget: () => onOpenBudget(month),
  }
  // The checklist gives way to the month once everything is in place
  const setupDone = data !== null && SETUP_STEPS.every(s => done[s.key])
  const monthLabel = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'el-GR', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('overview.title')}
        subtitle={monthLabel}
        actions={<Button icon="printer" onClick={onPrintWorksheet} title={t('worksheet.button_hint')}>{t('worksheet.button')}</Button>}
      />

      {error !== null && (
        <Banner tone="warning" className="mb-4" action={<Button size="sm" icon="refresh" onClick={() => setAttempt(a => a + 1)}>{t('overview.retry')}</Button>}>
          {ipcErrorMessage(error, t)}
        </Banner>
      )}

      <OverviewTiles
        data={data}
        totals={totals}
        onShowMonth={() => onShowMonth(month)}
        onOpenBudget={() => onOpenBudget(month)}
        onOpenAccounts={() => onGoTo('accounts')}
      />

      {data && <OverviewBanners data={data} onOpenBudget={() => onOpenBudget(month)} onShowUncategorised={() => onShowUncategorised(month)} />}

      <div className={setupDone ? '' : 'grid gap-4 lg:grid-cols-[1fr_20rem]'}>
        {!setupDone && (
          <ListCard className="p-6">
            <h2 className="text-sm font-semibold text-fg">{t('overview.setup_title')}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t('overview.setup_intro')}</p>
            <ol className="mt-4 space-y-3">
              {SETUP_STEPS.map((step, index) => (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done[step.key] ? 'bg-success text-success-fg' : 'bg-accent/10 text-accent'}`}
                  >
                    <Icon name={done[step.key] ? 'check' : step.icon} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">
                      {index + 1}. {t(`overview.setup.${step.key}`)}
                      {done[step.key] && <span className="sr-only"> ({t('overview.setup_done')})</span>}
                    </div>
                    <div className="text-xs text-gray-500">{t(`overview.setup.${step.key}_${done[step.key] ? 'done' : 'hint'}`)}</div>
                  </div>
                  <Button size="sm" variant="ghost" icon="arrow-right" onClick={goTo[step.key]}>
                    {t(`overview.setup.${step.key}_go`)}
                  </Button>
                </li>
              ))}
            </ol>
          </ListCard>
        )}

        {/* Filled by Subscriptions & bills (#7); until then it says so instead of showing a made-up 0 */}
        <ListCard className="flex items-start gap-3 p-6">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
            <Icon name="calendar" size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{t('overview.upcoming')}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t('overview.upcoming_empty')}</p>
          </div>
        </ListCard>
      </div>
    </div>
  )
}
