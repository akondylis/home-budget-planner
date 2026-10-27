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
  archiveCategory:   (id: string)                     => ipcRenderer.invoke('category:archive', id),

  // ── Transactions ────────────────────────────────────────────────────────────
  listTransactions:  (filter: unknown)                => ipcRenderer.invoke('transaction:list', filter),
  listPayees:        ()                               => ipcRenderer.invoke('transaction:payees'),
  createTransaction: (input: unknown)                 => ipcRenderer.invoke('transaction:create', input),
  updateTransaction: (id: string, input: unknown)     => ipcRenderer.invoke('transaction:update', id, input),
  setCategory:       (ids: string[], categoryId: string | null) => ipcRenderer.invoke('transaction:setCategory', ids, categoryId),
  setMember:         (ids: string[], memberId: string | null)   => ipcRenderer.invoke('transaction:setMember', ids, memberId),
  createTransfer:    (input: unknown)                 => ipcRenderer.invoke('transaction:createTransfer', input),
  updateTransfer:    (transferId: string, input: unknown) => ipcRenderer.invoke('transaction:updateTransfer', transferId, input),
  linkTransfer:      (idA: string, idB: string)       => ipcRenderer.invoke('transaction:linkTransfer', idA, idB),
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
