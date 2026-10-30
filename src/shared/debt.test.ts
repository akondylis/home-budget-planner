import { describe, expect, it } from 'vitest'
import {
  amortisationSchedule,
  annuityInstalment,
  planPayoff,
  projectPayoff,
  remainingBalance,
  termFromInstalment,
  type PlanDebt,
} from './debt'

describe('instalment and schedule', () => {
  it('should work out the annuity of a €10,000 loan at 6 % over 36 months as €304.22', () => {
    expect(annuityInstalment(1_000_000, 600, 36)).toBe(30_422)
  })

  it('should split an interest-free purchase in equal parts and leave the remainder on the last row', () => {
    const instalment = annuityInstalment(100_000, 0, 24)
    expect(instalment).toBe(4167)
    const rows = amortisationSchedule({ principalCents: 100_000, rateBp: 0, instalmentCents: instalment, startDate: '2026-01-31', termMonths: 24 })
    expect(rows).toHaveLength(24)
    expect(rows[23].paymentCents).toBe(100_000 - 4167 * 23)
    expect(rows[23].balanceCents).toBe(0)
    expect(rows[1].dueDate).toBe('2026-02-28')
  })

  it('should charge interest on the balance before each payment and end at zero', () => {
    const rows = amortisationSchedule({ principalCents: 1_000_000, rateBp: 600, instalmentCents: 30_422, startDate: '2026-01-15', termMonths: 36 })
    expect(rows[0].interestCents).toBe(5000)
    expect(rows[0].principalCents).toBe(30_422 - 5000)
    expect(rows[1].interestCents).toBe(Math.round((rows[0].balanceCents * 600) / 120_000))
    expect(rows.at(-1)!.balanceCents).toBe(0)
    expect(rows.reduce((s, r) => s + r.principalCents, 0)).toBe(1_000_000)
  })

  it('should find the number of months from an instalment', () => {
    expect(termFromInstalment(1_000_000, 600, 30_422)).toBe(36)
    expect(termFromInstalment(100_000, 0, 5000)).toBe(20)
  })
})

describe('balance and payoff', () => {
  const loan = { principalCents: 1_000_000, rateBp: 600, balanceOverrideCents: null, balanceOverrideAt: null }

  it('should lower the balance by the principal part of each instalment paid', () => {
    const left = remainingBalance(loan, [{ date: '2026-01-15', amountCents: 30_422, kind: 'INSTALMENT' }])
    expect(left).toBe(1_000_000 + 5000 - 30_422)
  })

  it('should start from the statement balance and apply only later payments', () => {
    const left = remainingBalance(
      { ...loan, balanceOverrideCents: 500_000, balanceOverrideAt: '2026-06-30' },
      [
        { date: '2026-06-15', amountCents: 30_422, kind: 'INSTALMENT' },
        { date: '2026-07-15', amountCents: 30_422, kind: 'INSTALMENT' },
      ],
    )
    expect(left).toBe(500_000 + 2500 - 30_422)
  })

  it('should take an extra payment straight off the balance and shorten the term', () => {
    const before = projectPayoff(1_000_000, 600, 30_422, '2026-01-15')!
    const after = remainingBalance(loan, [{ date: '2026-01-01', amountCents: 200_000, kind: 'EXTRA' }])
    expect(after).toBe(800_000)
    const shorter = projectPayoff(after, 600, 30_422, '2026-01-15')!
    expect(before.months).toBe(36)
    expect(shorter.months).toBeLessThan(36)
    expect(shorter.interestCents).toBeLessThan(before.interestCents)
  })

  it('should say a debt never ends when the instalment does not cover the interest', () => {
    expect(projectPayoff(1_000_000, 1200, 10_000, '2026-01-01')).toBeNull()
  })

  it('should give no payoff date when nothing is left', () => {
    expect(projectPayoff(0, 600, 30_422, '2026-01-01')).toEqual({ months: 0, payoffDate: null, interestCents: 0 })
  })
})

describe('snowball and avalanche', () => {
  const debts: PlanDebt[] = [
    { id: 'car', balanceCents: 800_000, rateBp: 500, instalmentCents: 25_000 },
    { id: 'card', balanceCents: 150_000, rateBp: 1800, instalmentCents: 10_000 },
    { id: 'tv', balanceCents: 60_000, rateBp: 0, instalmentCents: 5000 },
  ]

  it('should put the smallest balance first for snowball and the highest rate first for avalanche', () => {
    expect(planPayoff(debts, 10_000, 'SNOWBALL', '2026-11').order.map(o => o.id)).toEqual(['tv', 'card', 'car'])
    expect(planPayoff(debts, 10_000, 'AVALANCHE', '2026-11').order.map(o => o.id)).toEqual(['card', 'car', 'tv'])
  })

  it('should end sooner and cost less interest than paying only the instalments', () => {
    const plan = planPayoff(debts, 10_000, 'AVALANCHE', '2026-11')
    expect(plan.months!).toBeLessThan(plan.baseline.months!)
    expect(plan.interestCents).toBeLessThan(plan.baseline.interestCents)
    expect(plan.debtFreeMonth! < plan.baseline.debtFreeMonth!).toBe(true)
  })

  it('should cost no more interest with avalanche than with snowball', () => {
    const avalanche = planPayoff(debts, 10_000, 'AVALANCHE', '2026-11')
    const snowball = planPayoff(debts, 10_000, 'SNOWBALL', '2026-11')
    expect(avalanche.interestCents).toBeLessThanOrEqual(snowball.interestCents)
  })

  it('should match the baseline with no extra money and no cleared debt yet', () => {
    const plan = planPayoff([debts[0]], 0, 'SNOWBALL', '2026-11')
    expect(plan.months).toBe(plan.baseline.months)
  })
})
