import { useTranslation } from 'react-i18next'
import { Icon } from '../components/shell/icons'
import { ListCard, PageHeader } from '../components/ui'
import { MAIN_NAV_ITEMS } from '../lib/nav-items'
import type { View } from '../types'

export interface PlannedScreenProps {
  view: View
}

/** Designed empty state for an area that is on the roadmap but not built yet */
export function PlannedScreen({ view }: PlannedScreenProps) {
  const { t } = useTranslation()
  const item = MAIN_NAV_ITEMS.find(i => i.id === view)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={item ? t(item.labelKey) : view} />
      <ListCard className="flex flex-col items-center px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
          <Icon name={item?.icon ?? 'info'} size={24} />
        </span>
        <h2 className="mt-4 text-sm font-semibold text-fg">{t('planned.title')}</h2>
        <p className="mt-1 max-w-md text-sm text-fg-muted">{t(`planned.${view}`)}</p>
      </ListCard>
    </div>
  )
}
