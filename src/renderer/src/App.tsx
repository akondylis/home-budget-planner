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
import { SettingsScreen } from './pages/SettingsScreen'
import { CommandPalette } from './components/CommandPalette'
import { AppTour } from './components/tour/AppTour'
import { WorksheetPreviewModal } from './components/pdf/WorksheetPreviewModal'
import { useThemeSync } from './hooks/useThemeSync'
import { useShortcuts, type ShortcutAction } from './hooks/useShortcuts'
import { useUiStore } from './store/ui'
import { activeAccounts, useLedgerStore } from './store/ledger'
import { EMPTY_FILTER, useTransactionsStore } from './store/transactions'
import { useImportStore } from './store/import'
import { changeLanguage, changeTheme, swapSidebar, toggleSidebar } from './lib/ui-actions'
import type { PaletteTarget } from './lib/command-palette'
import type { View } from './types'

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
  const [zoom, setZoom] = useState<number>(readStoredZoom)
  const [worksheetOpen, setWorksheetOpen] = useState(false)
  const sidebarPosition = useUiStore(s => s.sidebarPosition)
  const paletteOpen = useUiStore(s => s.paletteOpen)
  const entry = useLedgerStore(s => s.entry)
  const importWizard = useImportStore(s => s.wizard)
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

  const commands: Record<ShortcutAction, () => void> = {
    commandPalette: () => useUiStore.getState().setPaletteOpen(!useUiStore.getState().paletteOpen),
    addTransaction,
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

  // Statements need an account to go into: Accounts (Quick setup) comes first
  function importStatement(accountId?: string) {
    if (activeAccounts(useLedgerStore.getState().accounts).every(a => a.kind === 'CASH')) setView('accounts')
    else useImportStore.getState().openWizard(accountId)
  }

  /** After an import: the log shows just its rows */
  function showImport(batchId: string) {
    useTransactionsStore.getState().setFilter({ ...EMPTY_FILTER(), month: null, importBatchId: batchId })
    setView('transactions')
  }

  function openAccountTransactions(accountId: string) {
    useTransactionsStore.getState().setFilter({ accountId, month: null })
    setView('transactions')
  }

  function runPaletteTarget(target: PaletteTarget) {
    useUiStore.getState().setPaletteOpen(false)
    switch (target.kind) {
      case 'view': setView(target.view); break
      case 'shortcut': commands[target.action](); break
      case 'tour': useUiStore.getState().startTour(); break
      case 'import': importStatement(); break
      case 'worksheet': setWorksheetOpen(true); break
      case 'dataFolder': void window.api.openDataDir(); break
      case 'theme': changeTheme(target.theme); break
      case 'language': void changeLanguage(target.lang); break
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
      case 'overview': return <OverviewScreen onPrintWorksheet={() => setWorksheetOpen(true)} />
      case 'accounts': return <AccountsScreen onOpenTransactions={openAccountTransactions} onImport={importStatement} />
      case 'transactions': return <TransactionsScreen onGoToAccounts={() => setView('accounts')} onImport={() => importStatement()} />
      case 'settings': return <SettingsScreen />
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
      {worksheetOpen && <WorksheetPreviewModal onClose={() => setWorksheetOpen(false)} />}
      {importWizard && (
        <ImportWizard
          accountId={importWizard.accountId}
          onClose={() => useImportStore.getState().closeWizard()}
          onImported={showImport}
        />
      )}
      {entry && <TransactionForm request={entry} onClose={() => useLedgerStore.getState().closeEntry()} />}
      <AppTour />
    </div>
  )
}
