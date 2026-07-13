import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater, { type UpdateInfo } from 'electron-updater'
import { safeUpdaterError, updaterEnabled } from './updaterPolicy'

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | { state: 'disabled' | 'idle' | 'checking' | 'up-to-date' }
  | { state: 'available'; version: string; releaseNotes?: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let initialized = false
let status: UpdateStatus = { state: 'idle' }
let downloaded = false
let downloadStarted = false

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (initialized) return
  initialized = true
  const enabled = updaterEnabled(process.platform, app.isPackaged, process.env.VEGA_ENABLE_UPDATER)

  const publish = (next: UpdateStatus): void => {
    status = next
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('updater:status', next)
  }

  ipcMain.handle('updater:getStatus', () => status)
  ipcMain.handle('updater:check', async () => {
    if (!enabled) { publish({ state: 'disabled' }); return }
    await autoUpdater.checkForUpdates()
  })
  ipcMain.handle('updater:download', async () => {
    if (!enabled || status.state !== 'available' || downloadStarted) throw new Error('Nenhuma atualização disponível para download.')
    downloadStarted = true
    try { await autoUpdater.downloadUpdate() }
    catch (error) { downloadStarted = false; throw error }
  })
  ipcMain.handle('updater:install', () => {
    if (!enabled || !downloaded) throw new Error('A atualização ainda não está pronta para instalar.')
    autoUpdater.quitAndInstall(false, true)
  })

  if (!enabled) { status = { state: 'disabled' }; return }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.disableWebInstaller = true

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    downloadStarted = false
    publish({ state: 'available', version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) })
  })
  autoUpdater.on('update-not-available', () => publish({ state: 'up-to-date' }))
  autoUpdater.on('download-progress', (progress) => publish({ state: 'downloading', percent: progress.percent }))
  autoUpdater.on('update-downloaded', (info) => { downloaded = true; publish({ state: 'downloaded', version: info.version }) })
  autoUpdater.on('error', (error) => { downloadStarted = false; publish({ state: 'error', message: safeUpdaterError(error) }) })

  const window = getWindow()
  window?.webContents.once('did-finish-load', () => { void autoUpdater.checkForUpdates().catch(() => undefined) })
}

function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (typeof notes === 'string') return notes.slice(0, 2_000)
  if (Array.isArray(notes)) return notes.map((item) => item.note).filter(Boolean).join('\n').slice(0, 2_000) || undefined
  return undefined
}
