// IPC for the Pages view: the renderer edits as the user; agents come in through the site bridge.
import { ipcMain } from 'electron'
import type {
  ProjectPageMoveInput,
  ProjectPagesResult,
  ProjectPageUpdateInput
} from '../../shared/project-pages-types'
import { isPagesScopeKey } from '../../shared/project-pages-space-key'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { projectPages, projectPagesSearch } from '../project-pages/project-pages'
import { buildPagesGraph, listPageTags } from '../project-pages/project-pages-graph'
import { registerProjectPagesDatabaseHandlers } from './project-pages-databases'
import { registerProjectPagesTransferHandlers } from './project-pages-transfer'
import { sendToTrustedUIRenderer } from './ui'

const CHANNELS = [
  'projectPages:list',
  'projectPages:read',
  'projectPages:create',
  'projectPages:update',
  'projectPages:move',
  'projectPages:archive',
  'projectPages:restore',
  'projectPages:history',
  'projectPages:readRevision',
  'projectPages:search',
  'projectPages:backlinks',
  'projectPages:graph',
  'projectPages:tags'
] as const

const USER = { kind: 'user' } as const

export function scope(value: unknown): string {
  if (!isPagesScopeKey(value)) {
    throw new ProjectPagesError('invalid', 'Unknown project.')
  }
  return value
}

export function pageId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new ProjectPagesError('invalid', 'A page id is required.')
  }
  return value
}

function optionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new ProjectPagesError('invalid', `${name} must be text.`)
  }
  return value
}

function parentId(value: unknown): string | null {
  return value === null || value === undefined ? null : pageId(value)
}

function update(value: unknown): ProjectPageUpdateInput {
  const input = (value ?? {}) as Record<string, unknown>
  const baseRevision = input.baseRevision
  if (typeof baseRevision !== 'number' || !Number.isSafeInteger(baseRevision) || baseRevision < 1) {
    throw new ProjectPagesError('invalid', 'baseRevision must be a positive number.')
  }
  const icon = input.icon === null ? null : optionalText(input.icon, 'icon')
  return {
    baseRevision,
    title: optionalText(input.title, 'title'),
    markdown: optionalText(input.markdown, 'markdown'),
    merge: input.merge === true,
    ...(icon === undefined ? {} : { icon })
  }
}

function move(value: unknown): ProjectPageMoveInput {
  const input = (value ?? {}) as Record<string, unknown>
  const index = input.index
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    throw new ProjectPagesError('invalid', 'index must be a number.')
  }
  return { parentId: parentId(input.parentId), index }
}

// Failures answer as results so the renderer never sees a rejected invoke.
export function guarded<T>(call: () => T): ProjectPagesResult<T> {
  try {
    return { ok: true, value: call() }
  } catch (error) {
    if (error instanceof ProjectPagesError) {
      return { ok: false, code: error.code, message: error.message, revision: error.revision }
    }
    return {
      ok: false,
      code: 'error',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

let stopForwarding: (() => void) | null = null

export function registerProjectPagesHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  const pages = projectPages
  ipcMain.handle('projectPages:list', (_e, key: unknown) =>
    guarded(() => pages().listPages(scope(key)))
  )
  ipcMain.handle('projectPages:read', (_e, key: unknown, id: unknown) =>
    guarded(() => pages().readPage(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:create', (_e, key: unknown, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return pages().createPage(
        scope(key),
        {
          parentId: parentId(input.parentId),
          title: optionalText(input.title, 'title'),
          markdown: optionalText(input.markdown, 'markdown')
        },
        USER
      )
    })
  )
  ipcMain.handle('projectPages:update', (_e, key: unknown, id: unknown, args: unknown) =>
    guarded(() => pages().updatePage(scope(key), pageId(id), update(args), USER))
  )
  ipcMain.handle('projectPages:move', (_e, key: unknown, id: unknown, args: unknown) =>
    guarded(() => pages().movePage(scope(key), pageId(id), move(args), USER))
  )
  ipcMain.handle('projectPages:archive', (_e, key: unknown, id: unknown) =>
    guarded(() => pages().archivePage(scope(key), pageId(id), USER))
  )
  ipcMain.handle('projectPages:restore', (_e, key: unknown, id: unknown) =>
    guarded(() => pages().restorePage(scope(key), pageId(id), USER))
  )
  ipcMain.handle('projectPages:history', (_e, key: unknown, id: unknown) =>
    guarded(() => pages().listRevisions(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:readRevision', (_e, key: unknown, id: unknown, rev: unknown) =>
    guarded(() => {
      if (typeof rev !== 'number' || !Number.isSafeInteger(rev)) {
        throw new ProjectPagesError('invalid', 'revision must be a number.')
      }
      const body = pages().readRevision(scope(key), pageId(id), rev)
      if (body === null) {
        throw new ProjectPagesError('not_found', 'That revision is no longer kept.')
      }
      return body
    })
  )
  ipcMain.handle('projectPages:search', (_e, key: unknown, query: unknown) =>
    guarded(() =>
      projectPagesSearch()
        .search(scope(key), typeof query === 'string' ? query.slice(0, 200) : '')
        .map((hit) => ({ page: hit.page, snippet: hit.snippet }))
    )
  )
  ipcMain.handle('projectPages:backlinks', (_e, key: unknown, id: unknown) =>
    guarded(() => projectPagesSearch().backlinks(scope(key), pageId(id)))
  )
  ipcMain.handle('projectPages:graph', (_e, key: unknown) =>
    guarded(() => buildPagesGraph(projectPagesSearch().snapshot(scope(key))))
  )
  ipcMain.handle('projectPages:tags', (_e, key: unknown) =>
    guarded(() => listPageTags(projectPagesSearch().snapshot(scope(key))))
  )
  registerProjectPagesDatabaseHandlers()
  registerProjectPagesTransferHandlers()
  stopForwarding?.()
  stopForwarding = pages().onChanged((change) =>
    sendToTrustedUIRenderer('projectPages:changed', change)
  )
}
