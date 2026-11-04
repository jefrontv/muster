// IPC for the large-file choice: an import pauses, every window shows the list, the answer comes
// back and (when asked to) is saved as the site's import rules.

import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'
import type { Store } from '../persistence'
import { SiteRunCancelledError } from '../sites/pipeline-contract'
import {
  formatImportSize,
  importPathCovers,
  mergeImportFileRules,
  type SiteImportFileRule,
  type SiteImportLargeEntry,
  type SiteImportLargeFilesAnswer,
  type SiteImportLargeFilesPrompt
} from '../../shared/site-import-file-rules'
import type { SiteRun } from '../../shared/site-run-types'
import { notifyWhenUnfocused } from './muster-window-attention'
import { notifySiteChanged } from './site-change-notifier'

const PROMPT_CHANNEL = 'siteImportLargeFiles:prompt'
const RESOLVED_CHANNEL = 'siteImportLargeFiles:resolved'

const pending = new Map<
  string,
  { prompt: SiteImportLargeFilesPrompt; answer: (value: SiteImportLargeFilesAnswer) => void }
>()

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

/** Skips become skip rules; whatever the user chose to copy becomes keep, so it is not asked again. */
export function rulesFromAnswer(
  entries: readonly SiteImportLargeEntry[],
  skip: readonly string[]
): SiteImportFileRule[] {
  const kept = entries.filter((entry) => !skip.some((path) => importPathCovers(path, entry.path)))
  return [
    ...skip.map((path) => ({ path, action: 'skip' as const })),
    ...kept.map((entry) => ({ path: entry.path, action: 'keep' as const }))
  ]
}

function readAnswer(
  value: unknown,
  prompt: SiteImportLargeFilesPrompt
): SiteImportLargeFilesAnswer {
  const raw = (value ?? {}) as { skip?: unknown; remember?: unknown }
  const offered = new Set(prompt.entries.map((entry) => entry.path))
  // Only paths the check offered: the renderer cannot widen what an import leaves out.
  const skip = Array.isArray(raw.skip)
    ? [...new Set(raw.skip.filter((path): path is string => typeof path === 'string'))].filter(
        (path) => offered.has(path)
      )
    : []
  return { skip, remember: raw.remember === true }
}

export function createLargeFilePrompter(
  store: Store
): (run: SiteRun, entries: SiteImportLargeEntry[], signal: AbortSignal) => Promise<string[]> {
  return (run, entries, signal) => {
    if (BrowserWindow.getAllWindows().every((window) => window.isDestroyed())) {
      return Promise.resolve([])
    }
    const prompt: SiteImportLargeFilesPrompt = {
      promptId: randomUUID(),
      runId: run.id,
      siteId: run.siteId,
      siteName: run.siteName,
      environment: run.environment,
      entries
    }
    return new Promise<string[]>((resolve, reject) => {
      const finish = (): void => {
        pending.delete(prompt.promptId)
        signal.removeEventListener('abort', onAbort)
        broadcast(RESOLVED_CHANNEL, prompt.promptId)
      }
      const onAbort = (): void => {
        finish()
        reject(new SiteRunCancelledError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      pending.set(prompt.promptId, {
        prompt,
        answer: (answer) => {
          finish()
          if (answer.remember) {
            const site = store.getSite(run.siteId)
            if (site) {
              store.updateSite(site.id, {
                importFileRules: mergeImportFileRules(
                  site.importFileRules ?? [],
                  rulesFromAnswer(entries, answer.skip)
                )
              })
              store.flush()
              notifySiteChanged(site.id)
            }
          }
          resolve(answer.skip)
        }
      })
      broadcast(PROMPT_CHANNEL, prompt)
      const total = entries.reduce(
        (sum, entry) => sum + (entry.kind === 'folder' ? entry.bytes : 0),
        0
      )
      notifyWhenUnfocused({
        title: `${run.siteName}: large files on the server`,
        body:
          total > 0
            ? `The import found ${formatImportSize(total)} of unusual folders. Choose what to skip.`
            : 'The import found unusually large files. Choose what to skip.'
      })
    })
  }
}

export function registerSiteImportLargeFileHandlers(): void {
  ipcMain.removeHandler('siteImportLargeFiles:respond')
  ipcMain.removeHandler('siteImportLargeFiles:listPending')
  ipcMain.handle(
    'siteImportLargeFiles:respond',
    (_event, args: { promptId?: unknown; answer?: unknown }): boolean => {
      const entry = typeof args?.promptId === 'string' ? pending.get(args.promptId) : undefined
      if (!entry) {
        return false
      }
      entry.answer(readAnswer(args.answer, entry.prompt))
      return true
    }
  )
  ipcMain.handle('siteImportLargeFiles:listPending', (): SiteImportLargeFilesPrompt[] =>
    [...pending.values()].map((entry) => entry.prompt)
  )
}
