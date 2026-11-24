// IPC for database pages: schema, views, and row properties, edited as the user.
import { ipcMain } from 'electron'
import { projectPagesDatabases } from '../project-pages/project-pages'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { guarded, pageId, scope } from './project-pages'

const CHANNELS = [
  'projectPages:database',
  'projectPages:enableDatabase',
  'projectPages:updateDatabase',
  'projectPages:setProperties',
  'projectPages:addRow'
] as const

const USER = { kind: 'user' } as const

function plainObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectPagesError('invalid', `${what} must be an object.`)
  }
  return value as Record<string, unknown>
}

export function registerProjectPagesDatabaseHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  const databases = projectPagesDatabases
  ipcMain.handle('projectPages:database', (_e, key: unknown, id: unknown) =>
    guarded(() => databases().readDatabase(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:enableDatabase', (_e, key: unknown, id: unknown) =>
    guarded(() => databases().enableDatabase(scope(key), pageId(id), USER))
  )
  ipcMain.handle('projectPages:updateDatabase', (_e, key: unknown, id: unknown, schema: unknown) =>
    guarded(() => databases().updateSchema(scope(key), pageId(id), schema, USER))
  )
  ipcMain.handle('projectPages:setProperties', (_e, key: unknown, id: unknown, patch: unknown) =>
    guarded(() =>
      databases().setProperties(scope(key), pageId(id), plainObject(patch, 'Properties'), USER)
    )
  )
  ipcMain.handle('projectPages:addRow', (_e, key: unknown, id: unknown, input: unknown) =>
    guarded(() => {
      const row = plainObject(input ?? {}, 'A row')
      return databases().addRow(
        scope(key),
        pageId(id),
        {
          title: typeof row.title === 'string' ? row.title : undefined,
          properties: row.properties ? plainObject(row.properties, 'Properties') : undefined
        },
        USER
      )
    })
  )
}
