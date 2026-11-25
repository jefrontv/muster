import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { createProjectPagesSearchIndex } from './project-pages-search-index'
import { createProjectPagesStore } from './project-pages-store'
import { runProjectPagesToolOp, type ProjectPagesToolOp } from './project-pages-tool-ops'

type Rows = { rows: { title: string; properties: Record<string, unknown> }[]; count: number }

const SOURCE = { cwd: '/work/acme', agent: 'claude', worktreeId: null, terminalHandle: null }
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-db-tools-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function tools(access: 'read' | 'write' = 'write') {
  const store = createProjectPagesStore({ rootDir: root })
  const deps = {
    store,
    search: createProjectPagesSearchIndex(store),
    databases: createProjectPagesDatabases({ rootDir: root, store }),
    repos: () => [{ id: 'r1', displayName: 'Acme', path: '/work/acme' }],
    settings: () =>
      ({
        experimentalProjectPages: true,
        agentCapabilityProjectPages: access
      }) as never
  }
  return (op: ProjectPagesToolOp, args: Record<string, unknown>) =>
    runProjectPagesToolOp(deps, op, args, SOURCE)
}

describe('database tools', () => {
  it('makes a database, adds rows and queries them by property name', async () => {
    const run = tools()
    await run('create', { title: 'Tasks' })
    const made = (await run('make_database', {
      page: 'Tasks',
      properties: [{ name: 'Points', type: 'number' }]
    })) as { properties: { name: string }[] }
    expect(made.properties.map((p) => p.name)).toEqual(['Status', 'Points'])
    await run('create', { title: 'Docs', parent: 'Tasks' })
    await run('create', { title: 'Tests', parent: 'Tasks' })
    await run('set_properties', { page: 'Tasks/Docs', properties: { Status: 'Done', Points: 3 } })
    await run('set_properties', { page: 'Tasks/Tests', properties: { Points: 8 } })
    const sorted = (await run('query_database', {
      database: 'Tasks',
      sort: { property: 'Points', direction: 'desc' }
    })) as Rows
    expect(sorted.rows.map((r) => r.title)).toEqual(['Tests', 'Docs'])
    expect(sorted.rows[1].properties).toEqual({ Status: 'Done', Points: 3 })
    const done = (await run('query_database', {
      database: 'Tasks',
      filter: { property: 'Status', op: 'is', value: 'Done' }
    })) as Rows
    expect(done.rows.map((r) => r.title)).toEqual(['Docs'])
  })

  it('replaces a default property when one with the same name is given', async () => {
    const run = tools()
    await run('create', { title: 'Bugs' })
    const made = (await run('make_database', {
      page: 'Bugs',
      properties: [
        { name: 'status', type: 'select', options: ['Open', 'Done', 'Fixed'] },
        { name: 'Closed', type: 'checkbox' }
      ]
    })) as { properties: { name: string; options?: string[] }[] }
    expect(made.properties).toEqual([
      { name: 'status', type: 'select', options: ['Open', 'Done', 'Fixed'] },
      { name: 'Closed', type: 'checkbox' }
    ])
    await expect(
      run('create', {
        title: 'Footer',
        parent: 'Bugs',
        properties: { status: 'Fixed', Closed: true }
      })
    ).resolves.toMatchObject({ created: true, properties: { status: 'Fixed', Closed: true } })
    const rows = (await run('query_database', { page: 'Bugs' })) as Rows
    expect(rows.rows[0].properties).toEqual({ status: 'Fixed', Closed: true })
  })

  it('checks off checklist items by text', async () => {
    const run = tools()
    await run('create', { title: 'List', markdown: '- [ ] Ship\n- [x] Plan\n' })
    await expect(
      run('check', { page: 'List', check: ['ship'], uncheck: ['Plan'] })
    ).resolves.toMatchObject({
      checked: ['Ship'],
      unchecked: ['Plan']
    })
    const read = (await run('read', { page: 'List' })) as { markdown: string }
    expect(read.markdown).toContain('- [x] Ship\n- [ ] Plan')
    await expect(run('read', { page: 'List', offset: 6, max_chars: 4 })).resolves.toMatchObject({
      markdown: 'Ship',
      truncated: true
    })
  })

  it('lets read-only agents query but not set properties', async () => {
    await tools()('create', { title: 'Tasks' })
    await tools()('make_database', { page: 'Tasks' })
    const run = tools('read')
    await expect(run('query_database', { database: 'Tasks' })).resolves.toMatchObject({ count: 0 })
    await expect(run('set_properties', { page: 'Tasks', properties: {} })).rejects.toThrow(
      /only read/
    )
  })
})
