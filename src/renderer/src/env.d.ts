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
    setNotificationSettings: (input: import('../../shared/notifications').NotificationSettings) => Promise<void>

    listMembers:       (opts?: { includeArchived?: boolean }) => Promise<import('../../shared/members').MemberSummary[]>
    createMember:      (input: import('../../shared/members').MemberInput) => Promise<string>
    updateMember:      (id: string, input: import('../../shared/members').MemberInput) => Promise<void>
    archiveMember:     (id: string, archived?: boolean) => Promise<void>

    listInstitutions:   (opts?: { includeArchived?: boolean }) => Promise<import('../../shared/ledger').InstitutionSummary[]>
    createInstitution:  (input: import('../../shared/ledger').InstitutionInput) => Promise<string>
    updateInstitution:  (id: string, input: import('../../shared/ledger').InstitutionInput) => Promise<void>
    archiveInstitution: (id: string, archived?: boolean) => Promise<void>
    moveInstitution:    (id: string, direction: 'up' | 'down') => Promise<void>

    listAccounts:      (opts?: { includeArchived?: boolean }) => Promise<import('../../shared/ledger').AccountSummary[]>
    createAccount:     (input: import('../../shared/ledger').AccountInput) => Promise<string>
    createAccounts:    (inputs: import('../../shared/ledger').AccountInput[]) => Promise<string[]>
    updateAccount:     (id: string, input: import('../../shared/ledger').AccountInput) => Promise<void>
    archiveAccount:    (id: string, archived?: boolean) => Promise<void>

    listCategories:    () => Promise<import('../../shared/ledger').CategoryNode[]>
    createCategory:    (input: import('../../shared/ledger').CategoryInput) => Promise<string>
    updateCategory:    (id: string, input: Omit<import('../../shared/ledger').CategoryInput, 'parentId'>) => Promise<void>
    archiveCategory:   (id: string, archived?: boolean) => Promise<void>
    manageCategories:  () => Promise<import('../../shared/ledger').ManagedCategoryNode[]>
    moveCategory:      (id: string, parentId: string) => Promise<void>
    reorderCategories: (parentId: string | null, orderedIds: string[]) => Promise<void>
    mergeCategory:     (sourceId: string, targetId: string) => Promise<import('../../shared/ledger').MergeResult>
    deleteCategory:    (id: string) => Promise<void>
    setCarryOver:      (id: string, carryOver: boolean) => Promise<void>

    listTransactions:  (filter: import('../../shared/ledger').TransactionFilter) => Promise<import('../../shared/ledger').TransactionPage>
    listPayees:        () => Promise<import('../../shared/ledger').PayeeSuggestion[]>
    createTransaction: (input: import('../../shared/ledger').TransactionInput) => Promise<string>
    updateTransaction: (id: string, input: import('../../shared/ledger').TransactionInput) => Promise<void>
    setCategory:       (ids: string[], categoryId: string | null) => Promise<number>
    setMember:         (ids: string[], memberId: string | null) => Promise<number>
    setPayee:          (ids: string[], payee: string | null) => Promise<number>
    createTransfer:    (input: import('../../shared/ledger').TransferInput) => Promise<string>
    updateTransfer:    (transferId: string, input: import('../../shared/ledger').TransferInput) => Promise<void>
    linkTransfer:      (idA: string, idB: string) => Promise<string>
    makeTransfer:      (ids: string[], otherAccountId: string) => Promise<string[]>
    deleteTransaction: (id: string) => Promise<void>

    pickStatement:     (labels: { title: string; filterName: string }) => Promise<import('../../shared/statement-import').PickedFile | null>
    previewImport:     (accountId: string, fileId: string, mapping?: import('../../shared/statement-import').ColumnMapping) =>
                         Promise<import('../../shared/statement-import').PreviewResult>
    commitImport:      (input: { previewId: string; decisions: import('../../shared/statement-import').ImportDecision[]; createdByMemberId?: string | null }) =>
                         Promise<import('../../shared/statement-import').CommitResult>
    listImports:       (accountId?: string) => Promise<import('../../shared/statement-import').ImportHistoryItem[]>
    undoImport:        (batchId: string) => Promise<{ removedCount: number }>

    listRules:         () => Promise<import('../../shared/statement-import').RuleSummary[]>
    createRule:        (input: import('../../shared/statement-import').RuleInput) => Promise<{ id: string; appliedCount: number }>
    updateRule:        (id: string, input: Partial<Omit<import('../../shared/statement-import').RuleInput, 'applyToUncategorised'>> & { priority?: number }) => Promise<void>
    deleteRule:        (id: string) => Promise<void>

    subscriptionHints: () => Promise<import('../../shared/statement-import').SubscriptionHint[]>

    getBudget:         (month: string) => Promise<import('../../shared/budget').BudgetMonth>
    setPlanned:        (month: string, categoryId: string, plannedCents: number) => Promise<void>
    copyBudget:        (input: { from: string; to: string; source: import('../../shared/budget').CopySource }) => Promise<number>
    clearBudget:       (month: string) => Promise<void>
    getBudgetYear:     (year: number) => Promise<import('../../shared/budget').BudgetYear>
    fillBudgetYear:    (input: import('../../shared/budget').FillYearInput) => Promise<number>

    listBills:         () => Promise<import('../../shared/recurrence').RecurringRuleRow[]>
    createBill:        (input: import('../../shared/recurrence').RecurringRuleInput) => Promise<string>
    updateBill:        (id: string, input: import('../../shared/recurrence').RecurringRuleInput) => Promise<void>
    setBillArchived:   (id: string, archived: boolean) => Promise<void>
    billOccurrences:   (range: { from: string; to: string }) => Promise<import('../../shared/recurrence').UpcomingBill[]>
    billCandidates:    (input: { ruleId: string; dueDate: string }) => Promise<import('../../shared/recurrence').CandidateRow[]>
    countBillMatches:  (input: { matchText: string }) => Promise<number>
    markBillPaid:      (input: { ruleId: string; dueDate: string; transactionId: string | null }) => Promise<void>
    payBillInCash:     (input: { ruleId: string; dueDate: string; accountId: string; bookedAt: string; amountCents: number; createdByMemberId?: string | null }) => Promise<string>
    skipBill:          (input: { ruleId: string; dueDate: string }) => Promise<void>
    unmarkBill:        (input: { ruleId: string; dueDate: string }) => Promise<void>

    listDebts:             () => Promise<import('../../shared/debt').DebtRow[]>
    getDebt:               (id: string) => Promise<import('../../shared/debt').DebtDetail>
    createDebt:            (input: import('../../shared/debt').DebtInput) => Promise<string>
    updateDebt:            (id: string, input: import('../../shared/debt').DebtInput) => Promise<void>
    setDebtBalance:        (input: { debtId: string; balanceCents: number | null; date: string }) => Promise<void>
    setDebtArchived:       (id: string, archived: boolean) => Promise<void>
    debtPaymentCandidates: (id: string) => Promise<import('../../shared/recurrence').CandidateRow[]>
    linkDebtPayment:       (input: { debtId: string; transactionId: string }) => Promise<void>
    unlinkDebtPayment:     (transactionId: string) => Promise<void>
    recordDebtCash:        (input: { debtId: string; accountId: string; bookedAt: string; amountCents: number; createdByMemberId?: string | null }) => Promise<string>

    getOverview:       (month: string) => Promise<import('../../shared/overview').OverviewMonth>
    getProjection:     (months: number) => Promise<import('../../shared/projection').Projection>
    reportCategories:  (input: { range: import('../../shared/reports').DateRange; compare: import('../../shared/reports').CompareMode; direction: import('../../shared/reports').CategoryDirection; level: import('../../shared/reports').CategoryLevel }) => Promise<import('../../shared/reports').CategoryReport>
    reportTrend:       (input: { range: import('../../shared/reports').DateRange }) => Promise<import('../../shared/reports').TrendReport>
    reportMembers:     (input: { range: import('../../shared/reports').DateRange; compare: import('../../shared/reports').CompareMode }) => Promise<import('../../shared/reports').MemberReport>
    reportBalances:    (input: { range: import('../../shared/reports').DateRange }) => Promise<import('../../shared/reports').BalanceReport>
    saveCsv:           (content: string, fileName: string, title: string) => Promise<{ success: false } | { success: true; filePath: string }>

    listNotifications:        () => Promise<import('../../shared/notifications').AppNotification[]>
    markNotificationsRead:    (keys: string[]) => Promise<void>
    markAllNotificationsRead: () => Promise<void>
    dismissNotification:      (key: string) => Promise<void>
    dismissAllNotifications:  () => Promise<void>
    /** A Windows toast was clicked (key null = the summary toast); returns the unsubscribe */
    onNotificationOpen:       (cb: (key: string | null) => void) => () => void

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
