// Sidebar destinations, shared by the sidebar and (later) the command palette.

import type { IconName } from '../components/shell/icons'
import type { View } from '../types'

export type NavItem = {
  id: View
  labelKey: string
  icon: IconName
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  { id: 'overview', labelKey: 'nav.overview', icon: 'dashboard' },
  { id: 'transactions', labelKey: 'nav.transactions', icon: 'receipt' },
  { id: 'budget', labelKey: 'nav.budget', icon: 'target' },
  { id: 'accounts', labelKey: 'nav.accounts', icon: 'bank' },
  { id: 'recurring', labelKey: 'nav.recurring', icon: 'repeat' },
  { id: 'debts', labelKey: 'nav.debts', icon: 'credit-card' },
  { id: 'projections', labelKey: 'nav.projections', icon: 'trending-up' },
  { id: 'reports', labelKey: 'nav.reports', icon: 'chart' },
]

export const FOOTER_NAV_ITEMS: NavItem[] = [
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings' },
]
