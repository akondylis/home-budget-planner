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
