/// <reference types="vite/client" />

// Injected by electron.vite.config.ts from package.json
declare const __APP_VERSION__: string

interface Window {
  api: {
    getSettings:   () => Promise<import('./types').AppSettings | null>
    setLanguage:   (l: import('./types').AppLanguage) => Promise<void>
    setDateFormat: (f: import('./lib/date-format').DateFormat) => Promise<void>
    getAppInfo:    () => Promise<{ portable: boolean; dataDir: string }>
    openDataDir:   () => Promise<void>

    listAccounts:      (opts?: { includeArchived?: boolean }) => Promise<import('../../shared/ledger').AccountSummary[]>
    createAccount:     (input: import('../../shared/ledger').AccountInput) => Promise<string>
    createAccounts:    (inputs: import('../../shared/ledger').AccountInput[]) => Promise<string[]>
    updateAccount:     (id: string, input: import('../../shared/ledger').AccountInput) => Promise<void>
    archiveAccount:    (id: string, archived?: boolean) => Promise<void>

    listCategories:    () => Promise<import('../../shared/ledger').CategoryNode[]>
    createCategory:    (input: import('../../shared/ledger').CategoryInput) => Promise<string>
    updateCategory:    (id: string, input: Omit<import('../../shared/ledger').CategoryInput, 'parentId'>) => Promise<void>
    archiveCategory:   (id: string) => Promise<void>

    listTransactions:  (filter: import('../../shared/ledger').TransactionFilter) => Promise<import('../../shared/ledger').TransactionPage>
    listPayees:        () => Promise<import('../../shared/ledger').PayeeSuggestion[]>
    createTransaction: (input: import('../../shared/ledger').TransactionInput) => Promise<string>
    updateTransaction: (id: string, input: import('../../shared/ledger').TransactionInput) => Promise<void>
    setCategory:       (ids: string[], categoryId: string | null) => Promise<number>
    createTransfer:    (input: import('../../shared/ledger').TransferInput) => Promise<string>
    updateTransfer:    (transferId: string, input: import('../../shared/ledger').TransferInput) => Promise<void>
    linkTransfer:      (idA: string, idB: string) => Promise<string>
    deleteTransaction: (id: string) => Promise<void>

    pickStatement:     (labels: { title: string; filterName: string }) => Promise<import('../../shared/statement-import').PickedFile | null>
    previewImport:     (accountId: string, fileId: string, mapping?: import('../../shared/statement-import').ColumnMapping) =>
                         Promise<import('../../shared/statement-import').PreviewResult>
    commitImport:      (input: { previewId: string; decisions: import('../../shared/statement-import').ImportDecision[] }) =>
                         Promise<import('../../shared/statement-import').CommitResult>
    listImports:       (accountId?: string) => Promise<import('../../shared/statement-import').ImportHistoryItem[]>
    undoImport:        (batchId: string) => Promise<{ removedCount: number }>

    listRules:         () => Promise<import('../../shared/statement-import').RuleSummary[]>
    createRule:        (input: import('../../shared/statement-import').RuleInput) => Promise<{ id: string; appliedCount: number }>
    updateRule:        (id: string, input: Partial<Omit<import('../../shared/statement-import').RuleInput, 'applyToUncategorised' | 'accountId'>> & { priority?: number }) => Promise<void>
    deleteRule:        (id: string) => Promise<void>

    exportPdf:    (report: import('../../shared/report-document').ReportDocument, fileName: string, dialogTitle: string) =>
                     Promise<{ success: false } | { success: true; filePath: string }>
    openFile:      (filePath: string) => Promise<void>

    setTheme:      (mode: import('./store/ui').ThemeMode) => Promise<void>

    zoom: {
      setFactor: (factor: number) => void
      getFactor: () => number
    }
  }
}
