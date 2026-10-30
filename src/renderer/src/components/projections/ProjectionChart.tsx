import { useTranslation } from 'react-i18next'
import { LineChart } from '../charts/LineChart'
import { formatMoney } from '../../../../shared/money'
import type { Projection } from '../../../../shared/projection'
import { chartMonthLabel } from '../../lib/chart-scale'
import { monthLabel } from '../../lib/budget-worksheet'
import { monthDate } from '../../lib/budget'

/** Month-end balance as one line from today, the zero line and the lowest point labelled */
export function ProjectionChart({ data }: { data: Projection }) {
  const { t, i18n } = useTranslation()
  const lowestIndex = 1 + data.months.findIndex(m => m.month === data.lowest.month)
  return (
    <LineChart
      points={[
        { label: t('projections.chart_today'), title: t('projections.chart_today'), cents: data.startCents },
        ...data.months.map(m => ({
          label: chartMonthLabel(m.month, i18n.language),
          title: t('projections.chart_month_end', { month: monthLabel(monthDate(m.month), i18n.language) }),
          cents: m.endCents,
          details: [
            { label: t('projections.col_in'), cents: m.inCents },
            { label: t('projections.col_out'), cents: 0 - m.outCents },
          ],
        })),
      ]}
      ariaLabel={t('projections.chart_label', {
        start: formatMoney(data.startCents),
        end: formatMoney(data.endCents),
        lowest: formatMoney(data.lowest.cents),
        month: monthLabel(monthDate(data.lowest.month), i18n.language),
      })}
      highlight={lowestIndex > 0 ? { index: lowestIndex, label: t('projections.chart_lowest', { amount: formatMoney(data.lowest.cents, { whole: true }) }) } : null}
      belowZeroLabel={t('projections.below_zero')}
    />
  )
}
