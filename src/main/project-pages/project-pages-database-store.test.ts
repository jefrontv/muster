import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
const AGENT = { kind: 'agent', agent: 'probe' } as const
const SCOPE = 'repo:r1'
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-db-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function setup() {
  const store = createProjectPagesStore({ rootDir: root })
  const databases = createProjectPagesDatabases({ rootDir: root, store })
  const db = store.createPage(SCOPE, { title: 'Tasks' }, USER)
  return { store, databases, dbId: db.meta.id }
}

describe('project pages databases', () => {
  it('turns a page into a database with the default schema and adds typed rows', () => {
    const { store, databases, dbId } = setup()
    const changes: (string | null)[] = []
    store.onChanged((change) => changes.push(change.pageId))
    expect(databases.enableDatabase(SCOPE, dbId, USER).schema.views.map((v) => v.kind)).toEqual([
      'table',
      'board'
    ])
    const row = databases.addRow(
      SCOPE,
      dbId,
      { title: 'Write docs', properties: { Status: 'Done' } },
      AGENT
    )
    expect(row.properties).toEqual({ status: 'done' })
    expect(row.editedBy).toEqual(AGENT)
    expect(databases.readDatabase(SCOPE, dbId).rows.map((r) => r.title)).toEqual(['Write docs'])
    expect(store.listPages(SCOPE).pages.find((p) => p.id === dbId)?.database).toBe(true)
    expect(changes).toContain(row.id)
  })

  it('refuses unknown properties, bad values, and rows outside a database', () => {
    const { store, databases, dbId } = setup()
    databases.enableDatabase(SCOPE, dbId, USER)
    const row = databases.addRow(SCOPE, dbId, { title: 'Row' }, USER)
    expect(() => databases.setProperties(SCOPE, row.id, { Owner: 'me' }, USER)).toThrow(
      /No property "Owner". This database has: Status/
    )
    expect(() => databases.setProperties(SCOPE, row.id, { status: 'Later' }, USER)).toThrow(
      /takes one of/
    )
    const loose = store.createPage(SCOPE, { title: 'Loose' }, USER)
    expect(() => databases.setProperties(SCOPE, loose.meta.id, { status: 'done' }, USER)).toThrow(
      /inside a database/
    )
  })

  it('saves a checked schema and keeps row values through page edits', () => {
    const { store, databases, dbId } = setup()
    const db = databases.enableDatabase(SCOPE, dbId, USER)
    const schema = {
      ...db.schema,
      properties: [...db.schema.properties, { id: 'points', name: 'Points', type: 'number' }]
    }
    databases.updateSchema(SCOPE, dbId, schema, USER)
    const row = databases.addRow(SCOPE, dbId, { title: 'R', properties: { Points: '5' } }, USER)
    store.updatePage(SCOPE, row.id, { baseRevision: 1, markdown: 'body' }, USER)
    expect(databases.readDatabase(SCOPE, dbId).rows[0].properties).toEqual({ points: 5 })
    expect(() => databases.updateSchema(SCOPE, dbId, { properties: [], views: [] }, USER)).toThrow(
      /at least one view/
    )
  })
})
