import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Field, Input, ListCard, Money, RowTitle, SectionHeader, Segmented } from '../ui'
import { monthsBetween, planExclusion, planInput, rateLabel, shortMonthLabel } from '../../lib/debts'
import { addMonths, todayDateOnly } from '../../../../shared/date-only'
import { formatMoney, parseMoney } from '../../../../shared/money'
import { planPayoff, type DebtRow, type PayoffStrategy } from '../../../../shared/debt'

export interface PayoffPlanProps {
  debts: DebtRow[]
}

/** "What if we pay a bit more?": an extra amount each month and the order it goes to the debts */
export function PayoffPlan({ debts }: PayoffPlanProps) {
  const { t, i18n } = useTranslation()
  const extraId = useId()
  const [extra, setExtra] = useState('')
  const [strategy, setStrategy] = useState<PayoffStrategy>('AVALANCHE')
  const { plan: input, left } = useMemo(() => planInput(debts), [debts])
  const extraCents = Math.max(0, parseMoney(extra) ?? 0)
  const firstMonth = addMonths(todayDateOnly().slice(0, 7), 1)
  const plan = useMemo(() => planPayoff(input, extraCents, strategy, firstMonth), [input, extraCents, strategy, firstMonth])
  const byId = new Map(debts.map(d => [d.id, d]))
  const baselineMonth = new Map(plan.baseline.order.map(o => [o.id, o.payoffMonth]))
  const month = (m: string | null) => (m ? shortMonthLabel(m, i18n.language) : '—')

  if (input.length === 0) {
    return <Banner tone="info">{t('debts.plan.nothing')}</Banner>
  }

  const sooner = plan.debtFreeMonth && plan.baseline.debtFreeMonth ? monthsBetween(plan.debtFreeMonth, plan.baseline.debtFreeMonth) : 0
  const saved = plan.baseline.interestCents - plan.interestCents

  return (
    <div className="space-y-5">
      <div className="card grid gap-4 px-4 py-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field label={t('debts.plan.extra')} htmlFor={extraId} hint={t('debts.plan.extra_hint')}>
          <Input id={extraId} inputMode="decimal" autoComplete="off" placeholder="0,00" value={extra} onChange={e => setExtra(e.target.value)} className="w-full text-right tabular-nums" />
        </Field>
        <Field label={t('debts.plan.strategy')} hint={t(`debts.plan.hint.${strategy}`)}>
          <Segmented<PayoffStrategy>
            label={t('debts.plan.strategy')}
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'AVALANCHE', label: t('debts.plan.AVALANCHE'), icon: 'trending-up' },
              { value: 'SNOWBALL', label: t('debts.plan.SNOWBALL'), icon: 'arrow-down' },
            ]}
          />
        </Field>
      </div>

      <div className="card px-4 py-4" aria-live="polite">
        {plan.debtFreeMonth ? (
          <>
            <p className="text-lg text-fg">
              {t('debts.plan.free_by')} <strong className="font-semibold">{month(plan.debtFreeMonth)}</strong>
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {extraCents > 0 && sooner > 0
                ? t('debts.plan.better', { count: sooner, interest: formatMoney(Math.max(0, saved)) })
                : t('debts.plan.as_is', { interest: formatMoney(plan.interestCents) })}
            </p>
          </>
        ) : (
          <p className="text-sm text-amber-700">{t('debts.plan.never')}</p>
        )}
      </div>

      <section aria-label={t('debts.plan.order')}>
        <SectionHeader title={t('debts.plan.order')} meta={t('debts.plan.order_hint')} />
        <ListCard className="divide-y divide-line">
          {plan.order.map((o, i) => {
            const d = byId.get(o.id)!
            const before = baselineMonth.get(o.id) ?? null
            return (
              <div key={o.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_7rem] items-center gap-3 px-4 py-2.5">
                <span className="text-sm font-semibold tabular-nums text-fg-muted">{i + 1}</span>
                <RowTitle title={d.name} meta={[d.rateBp > 0 ? rateLabel(d.rateBp, i18n.language) : t('debts.interest_free'), `${t('debts.instalment')} ${formatMoney(d.instalmentCents ?? 0)}`]} />
                <div className="text-right text-sm"><Money cents={d.remainingCents} /></div>
                <div className="text-right text-sm">
                  <div className="font-medium text-fg">{month(o.payoffMonth)}</div>
                  {before && before !== o.payoffMonth && <div className="text-xs text-gray-500">{t('debts.plan.instead_of', { month: month(before) })}</div>}
                </div>
              </div>
            )
          })}
        </ListCard>
      </section>

      {left.length > 0 && (
        <section aria-label={t('debts.plan.left_out')}>
          <SectionHeader title={t('debts.plan.left_out')} />
          <ListCard className="divide-y divide-line">
            {left.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2 text-fg-muted">
                <div className="min-w-0 flex-1"><RowTitle title={d.name} meta={[t(`debts.plan.why.${planExclusion(d)}`)]} /></div>
                <Money cents={d.remainingCents} />
              </div>
            ))}
          </ListCard>
        </section>
      )}
    </div>
  )
}
