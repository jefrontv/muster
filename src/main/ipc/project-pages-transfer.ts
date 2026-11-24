// IPC for moving a project's pages to and from a folder of markdown files.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import type { ProjectPagesResult, ProjectPagesTransfer } from '../../shared/project-pages-types'
import { projectPages, projectPagesDatabases } from '../project-pages/project-pages'
import { exportProjectPages } from '../project-pages/project-pages-export'
import { safeFileName, uniqueName } from '../project-pages/project-pages-file-names'
import { importProjectPages } from '../project-pages/project-pages-import'
import { guarded, scope } from './project-pages'

async function pickFolder(
  sender: WebContents,
  options: Electron.OpenDialogOptions
): Promise<string | null> {
  const parent = BrowserWindow.fromWebContents(sender)
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** A fresh folder inside the chosen one, so an export never writes over existing files. */
function exportFolder(chosen: string, name: unknown): string {
  const base = safeFileName(typeof name === 'string' ? name : 'Pages')
  const taken = new Set<string>()
  let folder = uniqueName(base, taken)
  while (existsSync(join(chosen, folder))) {
    folder = uniqueName(base, taken)
  }
  return join(chosen, folder)
}

export function registerProjectPagesTransferHandlers(): void {
  ipcMain.removeHandler('projectPages:export')
  ipcMain.removeHandler('projectPages:import')
  ipcMain.handle(
    'projectPages:export',
    async (
      event,
      key: unknown,
      name: unknown
    ): Promise<ProjectPagesResult<ProjectPagesTransfer>> => {
      const scopeKey = guarded(() => scope(key))
      if (!scopeKey.ok) {
        return scopeKey
      }
      const chosen = await pickFolder(event.sender, {
        title: 'Export pages',
        buttonLabel: 'Export here',
        properties: ['openDirectory', 'createDirectory']
      })
      if (!chosen) {
        return { ok: true, value: null }
      }
      return guarded(() => {
        const targetDir = exportFolder(chosen, name)
        const store = projectPages()
        const databases = projectPagesDatabases()
        return {
          ...exportProjectPages({ store, databases, scopeKey: scopeKey.value, targetDir }),
          path: targetDir
        }
      })
    }
  )
  ipcMain.handle(
    'projectPages:import',
    async (event, key: unknown): Promise<ProjectPagesResult<ProjectPagesTransfer>> => {
      const scopeKey = guarded(() => scope(key))
      if (!scopeKey.ok) {
        return scopeKey
      }
      const sourceDir = await pickFolder(event.sender, {
        title: 'Import a folder of markdown pages',
        buttonLabel: 'Import',
        properties: ['openDirectory']
      })
      if (!sourceDir) {
        return { ok: true, value: null }
      }
      return guarded(() => ({
        ...importProjectPages({
          store: projectPages(),
          scopeKey: scopeKey.value,
          sourceDir,
          parentId: null,
          author: { kind: 'user' }
        }),
        path: sourceDir
      }))
    }
  )
}
