import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
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

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-tools-'))
  store = createProjectPagesStore({ rootDir: root })
  settings = { experimentalProjectPages: true }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function run(op: ProjectPagesToolOp, args: Record<string, unknown> = {}, source = SOURCE) {
  return runProjectPagesToolOp(
    { store, repos: () => REPOS, settings: () => settings as GlobalSettings },
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

  it('honours the read-only and off capability levels', async () => {
    settings.agentCapabilityProjectPages = 'read'
    await expect(run('list')).resolves.toMatchObject({ count: 0 })
    await expect(run('create', { title: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
    settings.experimentalProjectPages = false
    await expect(run('list')).rejects.toMatchObject({ code: 'forbidden' })
  })
})
