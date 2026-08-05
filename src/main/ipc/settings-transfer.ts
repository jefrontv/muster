// Save/load a settings file through the native dialogs.
//
// The interesting logic (what is exportable, what an import is allowed to contain) lives in
// `shared/settings-transfer.ts` so it is testable without Electron. This module is the boundary:
// dialogs, disk, and the store write. Handlers return a tagged result instead of throwing, since
// an exception loses its type crossing the bridge.

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { Store } from '../persistence'
import {
  buildSettingsExport,
  parseSettingsImport,
  type SettingsExportOutcome,
  type SettingsImportOutcome
} from '../../shared/settings-transfer'

export type { SettingsExportOutcome, SettingsImportOutcome }

const CHANNELS = ['settings:exportToFile', 'settings:importFromFile'] as const

function parentWindowOf(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

function defaultExportFileName(now: Date): string {
  // Colons are illegal in Windows filenames, so the ISO timestamp is trimmed to a date.
  return `muster-settings-${now.toISOString().slice(0, 10)}.json`
}

export function registerSettingsTransferHandlers(store: Store): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('settings:exportToFile', async (event): Promise<SettingsExportOutcome> => {
    const now = new Date()
    const payload = buildSettingsExport({
      settings: store.getSettings(),
      homedir: homedir(),
      appVersion: app.getVersion(),
      now
    })
    const options = {
      defaultPath: defaultExportFileName(now),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const parent = parentWindowOf(event)
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) {
      return { ok: false, cancelled: true }
    }
    try {
      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'writeFailed' }
    }
    return { ok: true, filePath, settingCount: Object.keys(payload.settings).length }
  })

  ipcMain.handle('settings:importFromFile', async (event): Promise<SettingsImportOutcome> => {
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const parent = parentWindowOf(event)
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const sourcePath = filePaths[0]
    if (canceled || !sourcePath) {
      return { ok: false, cancelled: true }
    }

    let raw: string
    try {
      raw = await readFile(sourcePath, 'utf8')
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'readFailed' }
    }

    const parsed = parseSettingsImport(raw, homedir())
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason }
    }
    // Why notifyListeners without an origin id: an import rewrites arbitrary settings, so every
    // window (including the one that asked) has to re-read rather than patch its local copy.
    const settings = store.updateSettings(parsed.settings, { notifyListeners: true })
    return {
      ok: true,
      settings,
      appliedKeys: Object.keys(parsed.settings),
      ignoredKeys: parsed.ignoredKeys
    }
  })
}
