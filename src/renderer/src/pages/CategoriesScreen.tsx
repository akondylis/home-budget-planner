import { useTranslation } from 'react-i18next'
import { Button, PageHeader, Segmented } from '../components/ui'
import { CategoriesTab } from '../components/categories/CategoriesTab'
import { RulesTab } from '../components/categories/RulesTab'
import type { CategoriesTab as Tab } from '../lib/categories'
import type { View } from '../types'

export interface CategoriesScreenProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
  /** The page the back button returns to */
  backTo: View
  onBack: () => void
  onShowTransactions: (categoryId: string) => void
}

/** Categories and the merchant rules that sort imports into them */
export function CategoriesScreen({ tab, onTabChange, backTo, onBack, onShowTransactions }: CategoriesScreenProps) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={t('categories.title')}
        className="mb-2"
        actions={<Button variant="ghost" icon="arrow-left" onClick={onBack}>{t(`nav.${backTo}`)}</Button>}
      />
      <Segmented<Tab>
        label={t('categories.title')}
        value={tab}
        onChange={onTabChange}
        options={[
          { value: 'categories', label: t('categories.tab_categories'), icon: 'tag' },
          { value: 'rules', label: t('categories.tab_rules'), icon: 'filter' },
        ]}
      />
      {tab === 'categories' ? <CategoriesTab onShowTransactions={onShowTransactions} /> : <RulesTab />}
    </div>
  )
}
