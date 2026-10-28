// Command palette (Ctrl+K): the searchable items and how they rank.
// Pure, so App decides what running a target does.
//
// Extending it: a new domain (accounts, transactions…) adds a target kind, a
// group (with its limit in GROUP_LIMITS) and an `<entity>Items()` builder, and
// CommandPalette loads that data when it opens.

import type { TFunction } from 'i18next'
import type { IconName } from '../components/shell/icons'
import type { ThemeMode } from '../store/ui'
import type { AppLanguage } from '../types'
import { SHORTCUTS, type ShortcutAction } from '../hooks/useShortcuts'
import { normalise } from '../../../shared/search-normalise'
import type { MemberSummary } from '../../../shared/members'
import { FOOTER_NAV_ITEMS, MAIN_NAV_ITEMS, type NavItem } from './nav-items'

export type PaletteTarget =
  | { kind: 'view'; view: NavItem['id'] }
  | { kind: 'shortcut'; action: PaletteShortcut }
  | { kind: 'tour' }
  | { kind: 'import' }
  | { kind: 'importHistory' }
  | { kind: 'worksheet' }
  | { kind: 'dataFolder' }
  | { kind: 'theme'; theme: ThemeMode }
  | { kind: 'language'; lang: AppLanguage }
  | { kind: 'member'; memberId: string }
  | { kind: 'household' }
  | { kind: 'categories'; tab: 'categories' | 'rules' }
  | { kind: 'budgetCopy' }

export type PaletteGroup = 'actions'

export interface PaletteItem {
  id: string
  group: PaletteGroup
  title: string
  subtitle?: string
  /** Extra words the item is found by, not shown */
  keywords?: string
  /** Shortcut keys shown on the right */
  keys?: string[][]
  icon: IconName
  target: PaletteTarget
}

export interface PaletteSection {
  group: PaletteGroup
  items: PaletteItem[]
}

// Shortcuts that make sense as a command (Ctrl+K itself would only close the palette)
const PALETTE_SHORTCUTS = ['addTransaction', 'toggleSidebar', 'swapSidebar', 'zoomIn', 'zoomOut', 'zoomReset'] as const
export type PaletteShortcut = (typeof PALETTE_SHORTCUTS)[number]

const SHORTCUT_ICON: Record<PaletteShortcut, IconName> = {
  addTransaction: 'plus',
  toggleSidebar: 'sidebar',
  swapSidebar: 'swap',
  zoomIn: 'plus',
  zoomOut: 'minus',
  zoomReset: 'search',
}

const THEME_ICON: Record<ThemeMode, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' }

/** Group order, and how many hits each group shows for a query */
const GROUP_LIMITS: [PaletteGroup, number][] = [
  ['actions', 8],
]

export interface ActionContext {
  t: TFunction
  theme: ThemeMode
  lang: string
  /** Active members, to switch who is using the app */
  members?: MemberSummary[]
  currentMemberId?: string | null
}

export function keysOf(action: ShortcutAction): string[][] | undefined {
  return SHORTCUTS.find(s => s.action === action)?.keys
}

export function navItems(t: TFunction): PaletteItem[] {
  return [...MAIN_NAV_ITEMS, ...FOOTER_NAV_ITEMS].map(n => ({
    id: `view:${n.id}`,
    group: 'actions',
    title: t('palette.go_to', { name: t(n.labelKey) }),
    icon: n.icon,
    target: { kind: 'view', view: n.id },
  }))
}

/** Every command: navigation, shortcut actions, app actions, preferences */
export function buildActions({ t, theme, lang, members = [], currentMemberId = null }: ActionContext): PaletteItem[] {
  const shortcuts: PaletteItem[] = PALETTE_SHORTCUTS.map(action => ({
    id: `shortcut:${action}`,
    group: 'actions',
    title: t(`shortcuts.actions.${action}`),
    keys: keysOf(action),
    icon: SHORTCUT_ICON[action],
    target: { kind: 'shortcut', action },
  }))

  const app: PaletteItem[] = [
    { id: 'import', group: 'actions', title: t('import.command'), keywords: 'import statement csv bank card εισαγωγη κινησεις τραπεζα καρτα', icon: 'download', target: { kind: 'import' } },
    { id: 'importHistory', group: 'actions', title: t('import.history_title'), keywords: 'import history undo statement ιστορικο εισαγωγες αναιρεση', icon: 'undo', target: { kind: 'importHistory' } },
    { id: 'budgetCopy', group: 'actions', title: t('palette.budget_copy'), keywords: 'budget plan copy last month προυπολογισμος πλανο αντιγραφη προηγουμενος μηνας', icon: 'copy', target: { kind: 'budgetCopy' } },
    { id: 'worksheet', group: 'actions', title: t('palette.worksheet'), keywords: 'pdf print export budget worksheet εκτυπωση', icon: 'printer', target: { kind: 'worksheet' } },
    { id: 'tour', group: 'actions', title: t('palette.tour'), keywords: 'tour guide help ξεναγηση βοηθεια', icon: 'flag', target: { kind: 'tour' } },
    { id: 'household', group: 'actions', title: t('settings.household'), keywords: 'household members family parents νοικοκυριο μελη οικογενεια γονεις', icon: 'users', target: { kind: 'household' } },
    { id: 'categories', group: 'actions', title: t('categories.title'), keywords: 'categories groups rename merge archive κατηγοριες ομαδες μετονομασια συγχωνευση', icon: 'tag', target: { kind: 'categories', tab: 'categories' } },
    { id: 'rules', group: 'actions', title: t('categories.tab_rules'), keywords: 'merchant rules import sort κανονες εμποροι εισαγωγη', icon: 'filter', target: { kind: 'categories', tab: 'rules' } },
    { id: 'dataFolder', group: 'actions', title: t('settings.open_data_folder'), keywords: 'data folder backup database φακελος', icon: 'folder', target: { kind: 'dataFolder' } },
  ]

  const themes: PaletteItem[] = (['light', 'dark', 'system'] as const)
    .filter(mode => mode !== theme)
    .map(mode => ({
      id: `theme:${mode}`,
      group: 'actions',
      title: t('palette.theme', { mode: t(`appearance.theme_${mode}`) }),
      keywords: `theme ${mode} θεμα`,
      icon: THEME_ICON[mode],
      target: { kind: 'theme', theme: mode },
    }))

  const other: AppLanguage = lang === 'en' ? 'el' : 'en'
  const language: PaletteItem = {
    id: `language:${other}`,
    group: 'actions',
    title: t(`palette.language_${other}`),
    keywords: 'language english greek γλωσσα ελληνικα',
    icon: 'flag',
    target: { kind: 'language', lang: other },
  }

  const switchMember: PaletteItem[] = members
    .filter(m => !m.archived && m.id !== currentMemberId)
    .map(m => ({
      id: `member:${m.id}`,
      group: 'actions',
      title: t('palette.use_as', { name: m.name }),
      keywords: 'member user switch who μελος χρηστης αλλαγη ποιος',
      icon: 'user',
      target: { kind: 'member', memberId: m.id },
    }))

  return [...navItems(t), ...app, ...switchMember, ...shortcuts, ...themes, language]
}

/**
 * 0 = title starts with the query, 1 = a title word starts with the first query word,
 * 2 = found elsewhere; null = some query word is missing. Accent-, case- and
 * script-insensitive (Greek folds to Latin, so "ruthm" finds "Ρυθμίσεις").
 */
export function rankItem(item: PaletteItem, query: string): number | null {
  const q = normalise(query)
  if (!q) return 2
  const title = normalise(item.title)
  const haystack = `${title} ${normalise(item.subtitle ?? '')} ${normalise(item.keywords ?? '')}`
  const words = q.split(' ')
  if (!words.every(w => haystack.includes(w))) return null
  if (title.startsWith(q)) return 0
  if (title.split(' ').some(w => w.startsWith(words[0]))) return 1
  return 2
}

/** Items matching the query, best first; ties keep the input order */
export function filterItems(items: PaletteItem[], query: string, limit: number): PaletteItem[] {
  return items
    .map((item, i) => ({ item, i, rank: rankItem(item, query) }))
    .filter((x): x is { item: PaletteItem; i: number; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map(x => x.item)
}

/**
 * Grouped results in display order. An empty query shows the places to go;
 * a query searches every group.
 */
export function buildSections(query: string, items: PaletteItem[]): PaletteSection[] {
  const byGroup = (group: PaletteGroup) => items.filter(i => i.group === group)
  if (!normalise(query)) {
    return [
      { group: 'actions' as const, items: byGroup('actions').filter(i => i.target.kind === 'view') },
    ].filter(s => s.items.length > 0)
  }
  return GROUP_LIMITS
    .map(([group, limit]) => ({ group, items: filterItems(byGroup(group), query, limit) }))
    .filter(s => s.items.length > 0)
}
