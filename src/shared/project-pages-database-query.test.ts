import { describe, expect, it } from 'vitest'
import {
  applyDatabaseView,
  defaultDatabaseSchema,
  groupRowsByOption,
  normalizePropertyValue,
  type DatabaseRow
} from './project-pages-database-query'
import { normalizeDatabaseSchema } from './project-pages-database-schema'

const schema = {
  ...defaultDatabaseSchema(),
  properties: [
    ...defaultDatabaseSchema().properties,
    { id: 'points', name: 'Points', type: 'number' as const },
    { id: 'due', name: 'Due', type: 'date' as const }
  ]
}
const rows: DatabaseRow[] = [
  { id: 'a', title: 'Alpha', properties: { status: 'done', points: 3 } },
  { id: 'b', title: 'Beta', properties: { status: 'todo', points: 8 } },
  { id: 'c', title: 'Gamma', properties: { points: 1 } }
]

describe('database values', () => {
  it('stores select options by id and accepts their names', () => {
    const status = schema.properties[0]
    expect(normalizePropertyValue(status, 'In progress')).toBe('doing')
    expect(normalizePropertyValue(status, 'done')).toBe('done')
    expect(() => normalizePropertyValue(status, 'Later')).toThrow(/Not started, In progress, Done/)
  })

  it('checks numbers, dates and empties', () => {
    expect(normalizePropertyValue(schema.properties[1], '4.5')).toBe(4.5)
    expect(() => normalizePropertyValue(schema.properties[2], '24/11/2026')).toThrow(/YYYY-MM-DD/)
    expect(normalizePropertyValue(schema.properties[2], '')).toBeNull()
  })
})

describe('database views', () => {
  it('filters then sorts, with select order and empties last', () => {
    const view = { id: 'v', name: 'V', kind: 'table' as const }
    const byStatus = applyDatabaseView(rows, schema, {
      ...view,
      sort: { propertyId: 'status', direction: 'asc' }
    })
    expect(byStatus.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    const big = applyDatabaseView(rows, schema, {
      ...view,
      filter: { propertyId: 'title', op: 'contains', value: 'a' },
      sort: { propertyId: 'points', direction: 'desc' }
    })
    expect(big.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    const empty = applyDatabaseView(rows, schema, {
      ...view,
      filter: { propertyId: 'status', op: 'empty' }
    })
    expect(empty.map((r) => r.id)).toEqual(['c'])
  })

  it('groups board columns by option with a no-value column', () => {
    const columns = groupRowsByOption(rows, schema.properties[0])
    expect(columns.map((c) => [c.name, c.rows.map((r) => r.id)])).toEqual([
      ['Not started', ['b']],
      ['In progress', []],
      ['Done', ['a']],
      ['No value', ['c']]
    ])
  })
})

describe('schema checks', () => {
  it('accepts the default schema and points boards at a select', () => {
    const clean = normalizeDatabaseSchema({
      ...defaultDatabaseSchema(),
      views: [{ id: 'b', name: 'Board', kind: 'board', groupBy: 'missing' }]
    })
    expect(clean.views[0].groupBy).toBe('status')
  })

  it('refuses reserved, duplicate and unknown entries', () => {
    expect(() =>
      normalizeDatabaseSchema({ properties: [{ id: 'title', name: 'T', type: 'text' }], views: [] })
    ).toThrow(/reserved/)
    expect(() =>
      normalizeDatabaseSchema({
        properties: [
          { id: 'x', name: 'X', type: 'text' },
          { id: 'x', name: 'Y', type: 'text' }
        ],
        views: [{ id: 't', name: 'T', kind: 'table' }]
      })
    ).toThrow(/twice/)
    expect(() =>
      normalizeDatabaseSchema({
        properties: [{ id: 'x', name: 'X', type: 'colour' }],
        views: [{ id: 't', name: 'T', kind: 'table' }]
      })
    ).toThrow(/type/)
  })
})
