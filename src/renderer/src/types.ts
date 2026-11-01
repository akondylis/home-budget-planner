// Renderer-side types. Shapes shared with main live in src/shared/.

export type View =
  | 'overview'
  | 'transactions'
  | 'budget'
  | 'accounts'
  | 'recurring'
  | 'calendar'
  | 'debts'
  | 'projections'
  | 'reports'
  | 'settings'
  /** Reached from Transactions, Settings and Ctrl+K; not in the sidebar */
  | 'categories'

export type AppLanguage = 'el' | 'en'

export interface AppSettings {
  id: number
  language: AppLanguage
  dateFormat: string
  currency: string
  notifyLeadDays: number
  notifyToasts: boolean
  /** 1 = Monday, 0 = Sunday */
  weekStartsOn: number
  createdAt: string
  updatedAt: string
}
