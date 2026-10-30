import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, EmptyCard, Money, PageHeader, SectionHeader, Segmented, Spinner, StatTile } from '../components/ui'
import { DebtCard } from '../components/debts/DebtCard'
import { PayoffPlan } from '../components/debts/PayoffPlan'
import { useLedgerStore } from '../store/ledger'
import { useDebtsStore } from '../store/debts'
import { ipcErrorMessage } from '../lib/ipc-errors'
import { debtTotals, shortMonthLabel } from '../lib/debts'
import { sumMoney } from '../../../shared/money'
import type { DebtRow } from '../../../shared/debt'

type Tab = 'debts' | 'plan'

/** Debts & loans: how much is left, when it ends, and what paying a bit more would do */
export function DebtsScreen() {
  const { t, i18n } = useTranslation()
  const revision = useLedgerStore(s => s.revision)
  const { debts, loaded, error, load, openForm, openDetail } = useDebtsStore()
  const [tab, setTab] = useState<Tab>('debts')
  const [showArchived, setShowArchived] = useState(false)

  // Reloads after every write (an import can pay an instalment)
  useEffect(() => { void load() }, [load, revision])

  const totals = useMemo(() => debtTotals(debts), [debts])
  const active = debts.filter(d => !d.archived)
  const archived = debts.filter(d => d.archived)
  const weOwe = active.filter(d => d.direction === 'WE_OWE')
  const owedToUs = active.filter(d => d.direction === 'OWED_TO_US')
  const addButton = <Button variant="primary" icon="plus" onClick={() => openForm()}>{t('debts.add')}</Button>

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.debts')} subtitle={t('debts.subtitle')} actions={addButton} />

      {error !== null && error !== undefined && <Banner tone="warning" className="mb-4">{ipcErrorMessage(error, t)}</Banner>}

      {!loaded ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : debts.length === 0 ? (
        <EmptyCard icon="credit-card" title={t('debts.empty_title')} body={t('debts.empty_body')}>{addButton}</EmptyCard>
      ) : (
        <>
          <div className={`mb-6 grid grid-cols-1 gap-3 ${totals.owedToUsCents > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <StatTile icon="credit-card" label={t('debts.tile_owe')} value={<Money cents={totals.weOweCents} />} hint={t('debts.tile_owe_hint', { count: weOwe.filter(d => d.remainingCents > 0).length })} />
            <StatTile icon="repeat" label={t('debts.tile_monthly')} value={<Money cents={totals.monthlyCents} />} hint={t('debts.tile_monthly_hint')} />
            <StatTile
              icon={totals.someNeverEnd ? 'alert-triangle' : 'flag'}
              label={t('debts.tile_free')}
              value={totals.debtFreeDate ? shortMonthLabel(totals.debtFreeDate, i18n.language) : '—'}
              hint={totals.someNeverEnd ? t('debts.tile_free_never') : t('debts.tile_free_hint')}
            />
            {totals.owedToUsCents > 0 && (
              <StatTile icon="arrow-down" label={t('debts.tile_owed')} value={<Money cents={totals.owedToUsCents} />} hint={t('debts.tile_owed_hint', { count: owedToUs.filter(d => d.remainingCents > 0).length })} />
            )}
          </div>

          <div className="mb-4">
            <Segmented<Tab>
              label={t('debts.view')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'debts', label: t('debts.tab_debts'), icon: 'credit-card' },
                { value: 'plan', label: t('debts.tab_plan'), icon: 'target' },
              ]}
            />
          </div>

          {tab === 'plan' ? (
            <PayoffPlan debts={debts} />
          ) : (
            <div className="space-y-6">
              <DebtGroup title={t('debts.group_owe')} debts={weOwe} onOpen={openDetail} />
              <DebtGroup title={t('debts.group_owed')} debts={owedToUs} onOpen={openDetail} />
              {active.length === 0 && <p className="text-sm text-fg-muted">{t('debts.all_archived')}</p>}
              {archived.length > 0 && (
                <div>
                  <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
                    {t('debts.archived_toggle', { count: archived.length })}
                  </Button>
                  {showArchived && (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {archived.map(d => <DebtCard key={d.id} debt={d} onOpen={() => openDetail(d.id)} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DebtGroup({ title, debts, onOpen }: { title: string; debts: DebtRow[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  if (debts.length === 0) return null
  return (
    <section aria-label={title}>
      <SectionHeader title={title} meta={t('debts.count', { count: debts.length })} amount={<Money cents={sumMoney(debts.map(d => d.remainingCents))} />} />
      <div className="grid gap-3 md:grid-cols-2">
        {debts.map(d => <DebtCard key={d.id} debt={d} onOpen={() => onOpen(d.id)} />)}
      </div>
    </section>
  )
}
