import { useEffect, useState } from 'react'
import i18next from './i18n'  // initialise i18next before any component renders
import { TitleBar } from './components/shell/TitleBar'
import { Sidebar } from './components/shell/Sidebar'
import { OverviewScreen } from './pages/OverviewScreen'
import { PlannedScreen } from './pages/PlannedScreen'
import { AccountsScreen } from './pages/AccountsScreen'
import { TransactionsScreen } from './pages/TransactionsScreen'
import { TransactionForm } from './components/transactions/TransactionForm'
import { ImportWizard } from './components/import/ImportWizard'
import { ImportHistory } from './components/import/ImportHistory'
import { SettingsScreen } from './pages/SettingsScreen'
import { CategoriesScreen } from './pages/CategoriesScreen'
import { BudgetScreen } from './pages/BudgetScreen'
import { RecurringScreen } from './pages/RecurringScreen'
import { BillForm } from './components/recurring/BillForm'
import { CommandPalette } from './components/CommandPalette'
import { AppTour } from './components/tour/AppTour'
import { WorksheetPreviewModal } from './components/pdf/WorksheetPreviewModal'
import { useThemeSync } from './hooks/useThemeSync'
import { useShortcuts, type ShortcutAction } from './hooks/useShortcuts'
import { useNavHistory } from './hooks/useNavHistory'
import { useMouseNav } from './hooks/useMouseNav'
import { ShortcutsModal } from './components/ShortcutsModal'
import type { NavEntry } from './lib/nav-history'
import { useUiStore } from './store/ui'
import { activeAccounts, useLedgerStore } from './store/ledger'
import { EMPTY_FILTER, currentMonth, useTransactionsStore } from './store/transactions'
import { useImportStore } from './store/import'
import { useBudgetStore } from './store/budget'
import { useRecurringStore } from './store/recurring'
import { changeLanguage, changeTheme, swapSidebar, toggleSidebar } from './lib/ui-actions'
import { isImportable } from './lib/ledger'
import { BANKS_SECTION_ID } from './components/banks/BanksSection'
import type { PaletteTarget } from './lib/command-palette'
import type { View } from './types'
import type { CategoriesTab } from './lib/categories'

// ── Zoom ──────────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

function readStoredZoom(): number {
  try {
    const stored = localStorage.getItem('zoomFactor')
    return stored ? parseFloat(stored) : 1.0
  } catch {
    return 1.0
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('overview')
  const [categoriesTab, setCategoriesTab] = useState<CategoriesTab>('categories')
  // Where the Categories page's back button goes
  const [categoriesFrom, setCategoriesFrom] = useState<View>('transactions')
  const [zoom, setZoom] = useState<number>(readStoredZoom)
  const [worksheetOpen, setWorksheetOpen] = useState(false)
  const sidebarPosition = useUiStore(s => s.sidebarPosition)
  const paletteOpen = useUiStore(s => s.paletteOpen)
  const shortcutsOpen = useUiStore(s => s.shortcutsOpen)
  const entry = useLedgerStore(s => s.entry)
  const billForm = useRecurringStore(s => s.form)
  const importWizard = useImportStore(s => s.wizard)
  const importHistory = useImportStore(s => s.history)
  // Subscribing re-renders the tree when the date format changes in Settings
  useUiStore(s => s.dateFormat)

  useThemeSync()

  useEffect(() => {
    window.api.getSettings().then(s => {
      useUiStore.getState().setDateFormat(s?.dateFormat)
      // AppSettings is the source of truth for the language once it exists
      if (s?.language && s.language !== i18next.language) void i18next.changeLanguage(s.language)
    }).catch(err => console.error('[settings] load failed:', err))
  }, [])

  useEffect(() => {
    useLedgerStore.getState().load().catch(err => console.error('[ledger] load failed:', err))
  }, [])

  // First launch: show the way around once (Settings and Ctrl+K replay it)
  useEffect(() => {
    if (!useUiStore.getState().tourSeen) useUiStore.getState().startTour()
  }, [])

  // Back/forward (mouse side buttons, Alt+arrows, title bar) through views and the Categories tab
  const nav = useNavHistory(
    view === 'categories' ? { view, categoriesTab } : { view },
    () => true,
    restoreNavEntry,
  )
  useMouseNav(nav.back, nav.forward)

  function restoreNavEntry(e: NavEntry) {
    if (e.categoriesTab) setCategoriesTab(e.categoriesTab)
    setView(e.view)
  }

  const commands: Record<ShortcutAction, () => void> = {
    commandPalette: () => useUiStore.getState().setPaletteOpen(!useUiStore.getState().paletteOpen),
    addTransaction,
    searchTransactions,
    // The page on screen prints its own report; elsewhere the monthly worksheet
    print: () => {
      const target = useUiStore.getState().printTarget
      if (target) target()
      else setWorksheetOpen(true)
    },
    navBack: nav.back,
    navForward: nav.forward,
    showShortcuts: () => useUiStore.getState().setShortcutsOpen(true),
    toggleSidebar,
    swapSidebar,
    zoomIn: () => applyZoom(zoom + ZOOM_STEP),
    zoomOut: () => applyZoom(zoom - ZOOM_STEP),
    zoomReset: () => applyZoom(1.0),
  }
  useShortcuts(commands)

  // Without an account there is nowhere to book it: Accounts (Quick setup) comes first
  function addTransaction() {
    const ledger = useLedgerStore.getState()
    if (activeAccounts(ledger.accounts).length === 0) setView('accounts')
    else ledger.openEntry()
  }

  /** Ctrl+F: the log, with the cursor in its search box */
  function searchTransactions() {
    if (activeAccounts(useLedgerStore.getState().accounts).length === 0) return setView('accounts')
    setView('transactions')
    useTransactionsStore.getState().focusSearch()
  }

  // Statements need an account to go into: Accounts (Quick setup) comes first
  function importStatement(accountId?: string) {
    if (activeAccounts(useLedgerStore.getState().accounts).every(a => !isImportable(a.kind))) setView('accounts')
    else useImportStore.getState().openWizard(accountId)
  }

  /** After an import: the log shows just its rows */
  function showImport(batchId: string) {
    useImportStore.getState().closeHistory()
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month: null, importBatchId: batchId })
    setView('transactions')
  }

  function openAccountTransactions(accountId: string) {
    useTransactionsStore.getState().setFilter({ accountId, month: null })
    setView('transactions')
  }

  function openCategories(tab: CategoriesTab = 'categories') {
    setCategoriesTab(tab)
    if (view !== 'categories') setCategoriesFrom(view === 'settings' || view === 'budget' || view === 'overview' ? view : 'transactions')
    setView('categories')
  }

  function showCategoryTransactions(categoryId: string) {
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month: null, categoryId })
    setView('transactions')
  }

  function showBudgetTransactions(month: string, categoryId: string) {
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month, categoryId })
    setView('transactions')
  }

  function showMonth(month: string) {
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month })
    setView('transactions')
  }

  function openBudget(month: string) {
    useBudgetStore.getState().setMonth(month)
    setView('budget')
  }

  function showUncategorised(month: string) {
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month, uncategorised: true })
    setView('transactions')
  }

  /** Ctrl+K: this month's budget, its empty lines filled from last month's plan */
  function copyLastMonthsPlan() {
    const budget = useBudgetStore.getState()
    budget.setMonth(currentMonth())
    setView('budget')
    budget.copyFromPrevious('PLAN')
      .then(count => budget.setFlash({ kind: 'copied', count }))
      .catch(error => budget.setFlash({ kind: 'error', error }))
  }

  function runPaletteTarget(target: PaletteTarget) {
    useUiStore.getState().setPaletteOpen(false)
    switch (target.kind) {
      case 'view': setView(target.view); break
      case 'shortcut': commands[target.action](); break
      case 'tour': useUiStore.getState().startTour(); break
      case 'import': importStatement(); break
      case 'importHistory': useImportStore.getState().openHistory(); break
      case 'worksheet': setWorksheetOpen(true); break
      case 'dataFolder': void window.api.openDataDir(); break
      case 'theme': changeTheme(target.theme); break
      case 'language': void changeLanguage(target.lang); break
      case 'member': useUiStore.getState().setCurrentMember(target.memberId); break
      case 'household': setView('settings'); break
      case 'banks':
        setView('settings')
        // Once Settings has rendered, bring the Banks section into view
        requestAnimationFrame(() => document.getElementById(BANKS_SECTION_ID)?.scrollIntoView({ block: 'start' }))
        break
      case 'categories': openCategories(target.tab); break
      case 'budgetCopy': copyLastMonthsPlan(); break
      case 'billAdd': useRecurringStore.getState().openForm(); break
    }
  }

  function applyZoom(next: number) {
    const clamped = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10
    setZoom(clamped)
    try {
      localStorage.setItem('zoomFactor', String(clamped))
    } catch { /* zoom still applies for this session */ }
  }

  function renderView() {
    switch (view) {
      case 'overview':
        return (
          <OverviewScreen
            onPrintWorksheet={() => setWorksheetOpen(true)}
            onGoTo={setView}
            onShowMonth={showMonth}
            onShowUncategorised={showUncategorised}
            onOpenBudget={openBudget}
            onManageCategories={() => openCategories()}
          />
        )
      case 'accounts': return <AccountsScreen onOpenTransactions={openAccountTransactions} onImport={importStatement} />
      case 'transactions': return <TransactionsScreen onGoToAccounts={() => setView('accounts')} onImport={() => importStatement()} onManageCategories={() => openCategories()} />
      case 'budget':
        return (
          <BudgetScreen
            onShowTransactions={showBudgetTransactions}
            onShowUncategorised={showUncategorised}
            onManageCategories={() => openCategories()}
          />
        )
      case 'recurring': return <RecurringScreen />
      case 'settings': return <SettingsScreen onManageCategories={() => openCategories()} />
      case 'categories':
        return (
          <CategoriesScreen
            tab={categoriesTab}
            onTabChange={setCategoriesTab}
            backTo={categoriesFrom}
            onBack={() => setView(categoriesFrom)}
            onShowTransactions={showCategoryTransactions}
          />
        )
      default: return <PlannedScreen view={view} />
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-clip bg-bg text-fg">
      <TitleBar
        zoom={zoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        onZoomIn={() => applyZoom(zoom + ZOOM_STEP)}
        onZoomOut={() => applyZoom(zoom - ZOOM_STEP)}
        onZoomReset={() => applyZoom(1.0)}
        nav={nav}
      />
      <div className={`flex min-h-0 flex-1 ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
        <Sidebar view={view} onNavigate={setView} />
        <div className="flex min-w-0 flex-1 flex-col bg-gray-50">
          <main className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            {/* Zoom is chosen by the user at runtime */}
            <div style={{ zoom }} className="p-6">
              {renderView()}
            </div>
          </main>
        </div>
      </div>
      {paletteOpen && <CommandPalette onClose={() => useUiStore.getState().setPaletteOpen(false)} onRun={runPaletteTarget} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => useUiStore.getState().setShortcutsOpen(false)} />}
      {worksheetOpen &&<WorksheetPreviewModal onClose={() => setWorksheetOpen(false)} />}
      {importWizard && (
        <ImportWizard
          accountId={importWizard.accountId}
          onClose={() => useImportStore.getState().closeWizard()}
          onImported={showImport}
        />
      )}
      {importHistory && (
        <ImportHistory
          accountId={importHistory.accountId}
          onClose={() => useImportStore.getState().closeHistory()}
          onShowRows={showImport}
        />
      )}
      {billForm && <BillForm request={billForm} onClose={() => useRecurringStore.getState().closeForm()} />}
      {entry && <TransactionForm request={entry} onClose={() => useLedgerStore.getState().closeEntry()} />}
      <AppTour />
    </div>
  )
}
