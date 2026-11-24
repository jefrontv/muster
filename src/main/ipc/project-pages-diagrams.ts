// IPC for diagram pages: read, enable, and save draw.io XML as the user.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { projectPagesDiagrams } from '../project-pages/project-pages'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { guarded, pageId, scope } from './project-pages'

const CHANNELS = [
  'projectPages:diagram',
  'projectPages:enableDiagram',
  'projectPages:saveDiagram',
  'projectPages:exportDiagramFile'
] as const

const USER = { kind: 'user' } as const

function saveInput(value: unknown): { baseRevision: number; xml: unknown; outline: string } {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (typeof input.baseRevision !== 'number' || !Number.isInteger(input.baseRevision)) {
    throw new ProjectPagesError('invalid', 'A diagram save needs a baseRevision.')
  }
  const outline = typeof input.outline === 'string' ? input.outline.slice(0, 20_000) : ''
  return { baseRevision: input.baseRevision, xml: input.xml, outline }
}

type ExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: boolean; message?: string }

/** Asks where to save an exported SVG or PNG and writes it. */
async function exportFile(
  sender: Electron.WebContents,
  name: unknown,
  extension: unknown,
  data: unknown
): Promise<ExportResult> {
  if (extension !== 'svg' && extension !== 'png') {
    return { ok: false, message: 'Diagrams export as SVG or PNG.' }
  }
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
    return { ok: false, message: 'Nothing to export.' }
  }
  const safe = (typeof name === 'string' ? name : '').replace(/[/\\:*?"<>|]/g, '_').slice(0, 100)
  const options = {
    defaultPath: `${safe || 'Diagram'}.${extension}`,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
  }
  const parent = BrowserWindow.fromWebContents(sender)
  const picked = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  if (picked.canceled || !picked.filePath) {
    return { ok: false, cancelled: true }
  }
  await writeFile(picked.filePath, data)
  return { ok: true, path: picked.filePath }
}

export function registerProjectPagesDiagramHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  const diagrams = projectPagesDiagrams
  ipcMain.handle('projectPages:diagram', (_e, key: unknown, id: unknown) =>
    guarded(() => diagrams().readDiagram(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:enableDiagram', (_e, key: unknown, id: unknown) =>
    guarded(() => diagrams().enableDiagram(scope(key), pageId(id), USER))
  )
  ipcMain.handle('projectPages:saveDiagram', (_e, key: unknown, id: unknown, input: unknown) =>
    guarded(() => diagrams().saveDiagram(scope(key), pageId(id), saveInput(input), USER))
  )
  ipcMain.handle(
    'projectPages:exportDiagramFile',
    (event, name: unknown, ext: unknown, data: unknown) =>
      exportFile(event.sender, name, ext, data).catch(
        (err: unknown): ExportResult => ({
          ok: false,
          message: err instanceof Error ? err.message : String(err)
        })
      )
  )
}
