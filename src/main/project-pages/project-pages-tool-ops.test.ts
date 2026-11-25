import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
import { createProjectPagesSearchIndex } from './project-pages-search-index'
import { createProjectPagesStore, type ProjectPagesStore } from './project-pages-store'
import { runProjectPagesToolOp, type ProjectPagesToolOp } from './project-pages-tool-ops'
import type { ProjectPagesToolSource } from './project-pages-tool-target'

type Row = { id: string; path: string; edited_by: string }
type Result = {
  project: { id: string }
  page: Row
  pages: Row[]
  created: boolean
  markdown: string
  count: number
}

const REPOS = [
  { id: 'r1', displayName: 'Acme', path: '/work/acme' },
  { id: 'r2', displayName: 'Other', path: '/work/other' }
]
const SOURCE: ProjectPagesToolSource = {
  cwd: '/work/acme/src',
  agent: 'claude',
  worktreeId: null,
  terminalHandle: 'h1'
}

let root: string
let store: ProjectPagesStore
let settings: Partial<GlobalSettings>
let clock = 1_000

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-tools-'))
  // Each archive gets its own stamp, as it would a moment apart in the app.
  store = createProjectPagesStore({ rootDir: root, now: () => (clock += 1000) })
  settings = { experimentalProjectPages: true }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function run(op: ProjectPagesToolOp, args: Record<string, unknown> = {}, source = SOURCE) {
  return runProjectPagesToolOp(
    {
      store,
      search: createProjectPagesSearchIndex(store),
      repos: () => REPOS,
      settings: () => settings as GlobalSettings
    },
    op,
    args,
    source
  ) as Promise<Result>
}

describe('project pages tool ops', () => {
  it('creates, nests, reads by path and records the agent as editor', async () => {
    await run('create', { title: 'Launch', markdown: '## Goals\n\n- ship' })
    const child = await run('create', { title: 'Checklist', parent: 'Launch' })
    expect(child.page.path).toBe('Launch/Checklist')
    const again = await run('create', { title: 'launch' })
    expect(again.created).toBe(false)
    const read = await run('read', { page: 'Launch', section: 'Goals' })
    expect(read.markdown).toBe('## Goals\n\n- ship')
    expect(read.page.edited_by).toBe('claude')
    const list = await run('list', { depth: 1 })
    expect(list.pages.map((p) => p.path)).toEqual(['Launch'])
  })

  it('edits, appends and refuses a stale update with the current revision', async () => {
    await run('create', { title: 'Notes', markdown: 'one' })
    await run('edit', { page: 'Notes', old_text: 'one', new_text: 'two' })
    const appended = await run('append', { page: 'Notes', markdown: 'three' })
    expect(store.readPage('repo:r1', appended.page.id).markdown).toBe('two\n\nthree\n')
    await expect(
      run('update', { page: 'Notes', base_revision: 1, markdown: 'x' })
    ).rejects.toMatchObject({
      code: 'conflict',
      revision: 3
    })
    const hits = await run('search', { query: 'three' })
    expect(hits.count).toBe(1)
  })

  it("refuses another project's pages unless the user allowed it", async () => {
    await expect(run('list', { project: 'Other' })).rejects.toMatchObject({ code: 'forbidden' })
    settings.agentCapabilityProjectPagesCrossProject = true
    await expect(run('list', { project: 'Other' })).resolves.toMatchObject({
      project: { id: 'r2' }
    })
  })

  it('resolves the project from the worktree id before the cwd', async () => {
    const result = await run('list', {}, { ...SOURCE, cwd: '/elsewhere', worktreeId: 'r2::/wt/x' })
    expect(result.project.id).toBe('r2')
    await expect(run('list', {}, { ...SOURCE, cwd: '/elsewhere' })).rejects.toMatchObject({
      code: 'invalid'
    })
  })

  it('lists the Trash and restores a page to its old parent', async () => {
    await run('create', { title: 'Folder', folder: true })
    await run('create', { title: 'Note', parent: 'Folder' })
    await run('create', { title: 'Keep' })
    await run('archive', { page: 'Folder/Note' })
    const trash = await run('list', { archived: true })
    expect(trash.pages.map((p) => p.path)).toEqual(['Folder/Note'])
    expect((await run('list')).pages.map((p) => p.path)).toEqual(['Folder', 'Keep'])
    const restored = (await run('restore', { page: 'Note' })) as Result & { restored_to: string }
    expect(restored.restored_to).toBe('Folder')
    expect(restored.page.path).toBe('Folder/Note')
    expect((await run('list', { archived: true })).count).toBe(0)
  })

  it('restores to the top level when the old parent is gone', async () => {
    await run('create', { title: 'Folder', folder: true })
    const note = await run('create', { title: 'Note', parent: 'Folder' })
    await run('archive', { page: 'Folder/Note' })
    await run('archive', { page: 'Folder' })
    expect((await run('list', { archived: true })).pages.map((p) => p.path)).toEqual([
      'Folder',
      'Folder/Note'
    ])
    const restored = (await run('restore', { page: note.page.id })) as Result & {
      restored_to: string
    }
    expect(restored.restored_to).toBe('top level')
    expect((await run('list')).pages.map((p) => p.path)).toEqual(['Note'])
  })

  it('restores a folder with its pages, like the Trash button', async () => {
    await run('create', { title: 'Folder', folder: true })
    const child = await run('create', { title: 'Note', parent: 'Folder' })
    await run('archive', { page: 'Folder' })
    const trash = await run('list', { archived: true })
    expect(trash.pages).toMatchObject([{ path: 'Folder', folder: true }])
    await expect(run('restore', { page: child.page.id })).rejects.toMatchObject({
      code: 'invalid'
    })
    await run('restore', { page: 'Folder' })
    expect((await run('list')).pages.map((p) => p.path)).toEqual(['Folder', 'Folder/Note'])
    await expect(run('restore', { page: 'Folder' })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('honours the read-only and off capability levels', async () => {
    settings.agentCapabilityProjectPages = 'read'
    await expect(run('list')).resolves.toMatchObject({ count: 0 })
    await expect(run('create', { title: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(run('restore', { page: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
    settings.experimentalProjectPages = false
    await expect(run('list')).rejects.toMatchObject({ code: 'forbidden' })
  })
})
