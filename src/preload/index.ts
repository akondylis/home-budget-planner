import { contextBridge, ipcRenderer, webFrame } from 'electron'

// The renderer's only door to main. Channels are 'domain:action'; every method
// here has a matching type in src/renderer/src/env.d.ts.
contextBridge.exposeInMainWorld('api', {
  // ── Settings ────────────────────────────────────────────────────────────────
  getSettings:   ()              => ipcRenderer.invoke('settings:get'),
  setLanguage:   (l: string)     => ipcRenderer.invoke('settings:setLanguage', l),
  setDateFormat: (f: string)     => ipcRenderer.invoke('settings:setDateFormat', f),
  getAppInfo:    ()              => ipcRenderer.invoke('settings:appInfo'),
  openDataDir:   ()              => ipcRenderer.invoke('settings:openDataDir'),

  // ── Members ─────────────────────────────────────────────────────────────────
  listMembers:       (opts?: unknown)                 => ipcRenderer.invoke('member:list', opts),
  createMember:      (input: unknown)                 => ipcRenderer.invoke('member:create', input),
  updateMember:      (id: string, input: unknown)     => ipcRenderer.invoke('member:update', id, input),
  archiveMember:     (id: string, archived?: boolean) => ipcRenderer.invoke('member:archive', id, archived),

  // ── Banks ───────────────────────────────────────────────────────────────────
  listInstitutions:   (opts?: unknown)                 => ipcRenderer.invoke('institution:list', opts),
  createInstitution:  (input: unknown)                 => ipcRenderer.invoke('institution:create', input),
  updateInstitution:  (id: string, input: unknown)     => ipcRenderer.invoke('institution:update', id, input),
  archiveInstitution: (id: string, archived?: boolean) => ipcRenderer.invoke('institution:archive', id, archived),
  moveInstitution:    (id: string, direction: string)  => ipcRenderer.invoke('institution:move', id, direction),

  // ── Accounts ────────────────────────────────────────────────────────────────
  listAccounts:      (opts?: unknown)                 => ipcRenderer.invoke('account:list', opts),
  createAccount:     (input: unknown)                 => ipcRenderer.invoke('account:create', input),
  createAccounts:    (inputs: unknown)                => ipcRenderer.invoke('account:createMany', inputs),
  updateAccount:     (id: string, input: unknown)     => ipcRenderer.invoke('account:update', id, input),
  archiveAccount:    (id: string, archived?: boolean) => ipcRenderer.invoke('account:archive', id, archived),

  // ── Categories ──────────────────────────────────────────────────────────────
  listCategories:    ()                               => ipcRenderer.invoke('category:list'),
  createCategory:    (input: unknown)                 => ipcRenderer.invoke('category:create', input),
  updateCategory:    (id: string, input: unknown)     => ipcRenderer.invoke('category:update', id, input),
  archiveCategory:   (id: string, archived?: boolean) => ipcRenderer.invoke('category:archive', id, archived),
  manageCategories:  ()                               => ipcRenderer.invoke('category:manage'),
  moveCategory:      (id: string, parentId: string)   => ipcRenderer.invoke('category:move', id, parentId),
  reorderCategories: (parentId: string | null, orderedIds: string[]) => ipcRenderer.invoke('category:reorder', parentId, orderedIds),
  mergeCategory:     (sourceId: string, targetId: string) => ipcRenderer.invoke('category:merge', sourceId, targetId),
  deleteCategory:    (id: string)                     => ipcRenderer.invoke('category:delete', id),
  setCarryOver:      (id: string, carryOver: boolean) => ipcRenderer.invoke('category:setCarryOver', id, carryOver),

  // ── Transactions ────────────────────────────────────────────────────────────
  listTransactions:  (filter: unknown)                => ipcRenderer.invoke('transaction:list', filter),
  listPayees:        ()                               => ipcRenderer.invoke('transaction:payees'),
  createTransaction: (input: unknown)                 => ipcRenderer.invoke('transaction:create', input),
  updateTransaction: (id: string, input: unknown)     => ipcRenderer.invoke('transaction:update', id, input),
  setCategory:       (ids: string[], categoryId: string | null) => ipcRenderer.invoke('transaction:setCategory', ids, categoryId),
  setMember:         (ids: string[], memberId: string | null)   => ipcRenderer.invoke('transaction:setMember', ids, memberId),
  setPayee:          (ids: string[], payee: string | null)      => ipcRenderer.invoke('transaction:setPayee', ids, payee),
  createTransfer:    (input: unknown)                 => ipcRenderer.invoke('transaction:createTransfer', input),
  updateTransfer:    (transferId: string, input: unknown) => ipcRenderer.invoke('transaction:updateTransfer', transferId, input),
  linkTransfer:      (idA: string, idB: string)       => ipcRenderer.invoke('transaction:linkTransfer', idA, idB),
  makeTransfer:      (ids: string[], otherAccountId: string) => ipcRenderer.invoke('transaction:makeTransfer', ids, otherAccountId),
  deleteTransaction: (id: string)                     => ipcRenderer.invoke('transaction:delete', id),

  // ── Statement import ────────────────────────────────────────────────────────
  pickStatement:     (labels: unknown)                => ipcRenderer.invoke('import:pickFile', labels),
  previewImport:     (accountId: string, fileId: string, mapping?: unknown) => ipcRenderer.invoke('import:preview', accountId, fileId, mapping),
  commitImport:      (input: unknown)                 => ipcRenderer.invoke('import:commit', input),
  listImports:       (accountId?: string)             => ipcRenderer.invoke('import:history', accountId),
  undoImport:        (batchId: string)                => ipcRenderer.invoke('import:undo', batchId),

  // ── Category rules ──────────────────────────────────────────────────────────
  listRules:         ()                               => ipcRenderer.invoke('rule:list'),
  createRule:        (input: unknown)                 => ipcRenderer.invoke('rule:create', input),
  updateRule:        (id: string, input: unknown)     => ipcRenderer.invoke('rule:update', id, input),
  deleteRule:        (id: string)                     => ipcRenderer.invoke('rule:delete', id),

  // ── Subscriptions ───────────────────────────────────────────────────────────
  subscriptionHints: ()                               => ipcRenderer.invoke('subscription:hints'),

  // ── Budget ──────────────────────────────────────────────────────────────────
  getBudget:         (month: string)                  => ipcRenderer.invoke('budget:get', month),
  setPlanned:        (month: string, categoryId: string, plannedCents: number) => ipcRenderer.invoke('budget:setPlanned', month, categoryId, plannedCents),
  copyBudget:        (input: unknown)                 => ipcRenderer.invoke('budget:copy', input),
  clearBudget:       (month: string)                  => ipcRenderer.invoke('budget:clear', month),

  // ── PDF ─────────────────────────────────────────────────────────────────────
  exportPdf:     (report: unknown, fileName: string, dialogTitle: string) => ipcRenderer.invoke('pdf:export', report, fileName, dialogTitle),
  openFile:      (filePath: string) => ipcRenderer.invoke('shell:openFile', filePath),

  // ── Window ──────────────────────────────────────────────────────────────────
  setTheme:      (mode: string)  => ipcRenderer.invoke('window:setTheme', mode),

  zoom: {
    setFactor: (factor: number) => webFrame.setZoomFactor(factor),
    getFactor: () => webFrame.getZoomFactor(),
  },
})
