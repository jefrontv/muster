import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
import { createProjectPagesComments } from './project-pages-comments'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { createProjectPagesDiagrams } from './project-pages-diagram-store'
import { GREP_LIMITS } from './project-pages-grep'
import { createProjectPagesSearchIndex } from './project-pages-search-index'
import { createProjectPagesStore, type ProjectPagesStore } from './project-pages-store'
import { runProjectPagesToolOp } from './project-pages-tool-ops'

type Hit = Record<string, unknown>
type Grep = {
  count: number
  truncated: boolean
  pages: { id: string; path: string; hits: Hit[]; more?: number }[]
}

const SCOPE = 'repo:r1'
const USER = { kind: 'user' } as const
let root: string
let store: ProjectPagesStore
let deps: Parameters<typeof runProjectPagesToolOp>[0]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-grep-'))
  store = createProjectPagesStore({ rootDir: root })
  const diagrams = createProjectPagesDiagrams({ rootDir: root, store })
  deps = {
    store,
    search: createProjectPagesSearchIndex(store, {
      diagramXml: (scope, id) => diagrams.readDiagram(scope, id).xml
    }),
    repos: () => [{ id: 'r1', displayName: 'Acme', path: '/work/acme' }],
    settings: () => ({ experimentalProjectPages: true }) as GlobalSettings,
    diagrams,
    databases: createProjectPagesDatabases({ rootDir: root, store }),
    comments: createProjectPagesComments({ rootDir: root })
  }
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const source = { cwd: '/work/acme', agent: 'claude', worktreeId: null, terminalHandle: null }
function run(op: 'grep' | 'read', args: Record<string, unknown>) {
  return runProjectPagesToolOp(deps, op, args, source) as Promise<Grep & Record<string, unknown>>
}
function page(title: string, markdown = '', parentId: string | null = null): string {
  return store.createPage(SCOPE, { title, markdown, parentId }, USER).meta.id
}

describe('grep_pages', () => {
  it('finds literal text by line with context, matching read_page line numbers', async () => {
    page('Launch', 'Goals\n\nShip the API\nthen docs\n')
    const result = await run('grep', { query: 'api' })
    expect(result.pages).toEqual([
      {
        id: expect.any(String),
        path: 'Launch',
        hits: [{ line: 3, text: 'Ship the API', before: [''], after: ['then docs'] }]
      }
    ])
    const read = await run('read', { page: 'Launch', from_line: 3, to_line: 3 })
    expect(read.markdown).toBe('Ship the API')
    expect(read.lines).toEqual({ from: 3, to: 3, total: 4 })
    expect((await run('grep', { query: 'api', case_sensitive: true })).count).toBe(0)
  })

  it('takes regex, refuses a bad one, and filters by folder and tag', async () => {
    const folder = page('Specs', 'v2 #draft')
    page('Inside', 'v12 build', folder)
    page('Outside', 'v3 build #draft')
    const regex = await run('grep', { query: 'v\\d+ build', regex: true, context: 0 })
    expect(regex.pages.map((p) => p.path)).toEqual(['Specs/Inside', 'Outside'])
    await expect(run('grep', { query: '(', regex: true })).rejects.toMatchObject({
      code: 'invalid'
    })
    const scoped = await run('grep', { query: 'v', folder: 'Specs' })
    expect(scoped.pages.map((p) => p.path)).toEqual(['Specs', 'Specs/Inside'])
    const tagged = await run('grep', { query: 'v', tag: '#draft' })
    expect(tagged.pages.map((p) => p.path)).toEqual(['Specs', 'Outside'])
  })

  it('caps hits per page and in total, and skips the Trash', async () => {
    page('Many', Array.from({ length: 30 }, () => 'needle').join('\n'))
    const gone = page('Gone', 'needle')
    store.archivePage(SCOPE, gone, USER)
    const result = await run('grep', { query: 'needle', context: 0 })
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].hits).toHaveLength(GREP_LIMITS.perPage)
    expect(result.pages[0].more).toBe(10)
    const limited = await run('grep', { query: 'needle', limit: 5 })
    expect(limited).toMatchObject({ count: 5, truncated: true })
  })

  it('is not truncated when the hits exactly fill the limit', async () => {
    page('Few', 'needle\nneedle\nneedle')
    expect(await run('grep', { query: 'needle', limit: 3 })).toMatchObject({
      count: 3,
      truncated: false
    })
    expect(await run('grep', { query: 'needle', limit: 2 })).toMatchObject({
      count: 2,
      truncated: true
    })
  })

  it('finds diagram shapes by cell id instead of outline lines', async () => {
    const id = page('Map')
    const { page: meta } = deps.diagrams!.enableDiagram(SCOPE, id, USER)
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="s1" value="Billing service" vertex="1" parent="1"/></root></mxGraphModel>'
    deps.diagrams!.saveDiagram(
      SCOPE,
      id,
      { baseRevision: meta.revision, xml, outline: 'Shapes:\n- Billing service' },
      USER
    )
    const result = await run('grep', { query: 'billing' })
    expect(result.pages).toEqual([
      { id, path: 'Map', hits: [{ shape: 's1', field: 'label', text: 'Billing service' }] }
    ])
  })

  it('finds database cells by row and column, and comments only on request', async () => {
    const db = page('Tasks')
    deps.databases!.enableDatabase(SCOPE, db, USER)
    deps.databases!.updateSchema(
      SCOPE,
      db,
      {
        version: 1,
        properties: [{ id: 'owner', name: 'Owner', type: 'text' }],
        views: [{ id: 'v', name: 'Table', kind: 'table' }]
      },
      USER
    )
    const row = deps.databases!.addRow(
      SCOPE,
      db,
      { title: 'Docs', properties: { Owner: 'Priya' } },
      USER
    )
    const cells = await run('grep', { query: 'priya' })
    expect(cells.pages).toEqual([
      {
        id: db,
        path: 'Tasks',
        hits: [{ row: row.id, row_path: 'Tasks/Docs', column: 'Owner', text: 'Priya' }]
      }
    ])
    const thread = deps.comments!.create(SCOPE, db, { anchor: null, body: 'ask Priya' }, USER)
    expect((await run('grep', { query: 'ask priya' })).count).toBe(0)
    const withComments = await run('grep', { query: 'ask priya', comments: true })
    expect(withComments.pages[0].hits).toEqual([
      { thread: thread.id, message: thread.messages[0].id, text: 'ask Priya' }
    ])
  })
})
