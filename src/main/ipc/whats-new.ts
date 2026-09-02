// What's New IPC: the renderer asks once per launch whether this launch
// follows an update; main resolves the version transition, fetches the release
// notes, and records the new version only when the user dismisses the modal
// (so a crash before dismissal re-offers it next launch).

import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { resolveWhatsNewTransition, type WhatsNewGetResult } from '../../shared/whats-new'
import { getCanonicalUserDataPath } from '../persistence'
import { readWhatsNewRecord, writeWhatsNewRecord, type WhatsNewRecord } from '../whats-new-store'
import { createGitHubReleaseNotesLoader, type ReleaseNotesLoader } from '../whats-new-notes'

export function registerWhatsNewHandlers(
  options: {
    userDataDir?: string
    currentVersion?: string
    loadNotes?: ReleaseNotesLoader
  } = {}
): void {
  // Why lazy: getCanonicalUserDataPath needs the data path initialised; computing
  // it at first IPC call rather than at registration keeps this registrar
  // order-independent with the persistence bootstrap.
  const userDataDir = options.userDataDir ?? getCanonicalUserDataPath()
  const filePath = join(userDataDir, 'whats-new.json')
  const currentVersion = options.currentVersion ?? app.getVersion()
  const loadNotes = options.loadNotes ?? createGitHubReleaseNotesLoader()

  ipcMain.removeHandler('whatsnew:get')
  ipcMain.removeHandler('whatsnew:dismiss')

  ipcMain.handle('whatsnew:get', async (): Promise<WhatsNewGetResult> => {
    const record = readWhatsNewRecord(filePath)
    const resolution = resolveWhatsNewTransition(record.lastRunVersion, currentVersion)
    if (resolution.kind !== 'update') {
      // Why install/rollback also record: the stored version must never lag the
      // running one, or a later update would offer notes for the wrong release.
      if (record.lastRunVersion !== currentVersion) {
        writeWhatsNewRecord(filePath, { lastRunVersion: currentVersion })
      }
      return { status: 'none' }
    }
    const payload = await loadNotes(currentVersion, record.lastRunVersion ?? null)
    return {
      status: 'ready',
      payload: payload ?? {
        version: currentVersion,
        notes: null,
        notesUrl: null,
        missed: [],
        missedOverflow: 0
      }
    }
  })

  ipcMain.handle('whatsnew:dismiss', (): void => {
    writeWhatsNewRecord(filePath, { lastRunVersion: currentVersion } satisfies WhatsNewRecord)
  })
}
