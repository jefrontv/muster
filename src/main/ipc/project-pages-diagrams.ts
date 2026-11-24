// IPC for diagram pages: read, enable, and save draw.io XML as the user.
import { ipcMain } from 'electron'
import { projectPagesDiagrams } from '../project-pages/project-pages'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { guarded, pageId, scope } from './project-pages'

const CHANNELS = [
  'projectPages:diagram',
  'projectPages:enableDiagram',
  'projectPages:saveDiagram'
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
}
