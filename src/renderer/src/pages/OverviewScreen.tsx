import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/shell/icons'
import { Button, ListCard, Money, PageHeader, StatTile } from '../components/ui'

// Placeholder figures until transactions exist; the tiles set the page's hierarchy
const EMPTY_MONTH = { income: 0, expenses: 0, left: 0, upcoming: 0 }

const SETUP_STEPS: { key: string; icon: IconName }[] = [
  { key: 'members', icon: 'users' },
  { key: 'accounts', icon: 'bank' },
  { key: 'categories', icon: 'tag' },
  { key: 'budget', icon: 'target' },
]

export interface OverviewScreenProps {
  onPrintWorksheet: () => void
}

export function OverviewScreen({ onPrintWorksheet }: OverviewScreenProps) {
  const { t, i18n } = useTranslation()
  const month = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'el-GR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('overview.title')}
        subtitle={month}
        actions={<Button icon="printer" onClick={onPrintWorksheet} title={t('worksheet.button_hint')}>{t('worksheet.button')}</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="arrow-down" label={t('overview.income')} value={<Money cents={EMPTY_MONTH.income} />} />
        <StatTile icon="arrow-up" label={t('overview.expenses')} value={<Money cents={EMPTY_MONTH.expenses} />} />
        <StatTile icon="wallet" label={t('overview.left_to_spend')} value={<Money cents={EMPTY_MONTH.left} />} />
        <StatTile icon="calendar" label={t('overview.upcoming')} value={<Money cents={EMPTY_MONTH.upcoming} />} hint={t('overview.upcoming_hint')} />
      </div>

      <ListCard className="p-6">
        <h2 className="text-sm font-semibold text-fg">{t('overview.setup_title')}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t('overview.setup_intro')}</p>
        <ol className="mt-4 space-y-3">
          {SETUP_STEPS.map((step, index) => (
            <li key={step.key} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Icon name={step.icon} size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg">
                  {index + 1}. {t(`overview.setup.${step.key}`)}
                </div>
                <div className="text-xs text-gray-500">{t(`overview.setup.${step.key}_hint`)}</div>
              </div>
            </li>
          ))}
        </ol>
      </ListCard>
    </div>
  )
}
