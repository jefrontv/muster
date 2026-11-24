// Pure database logic: value checks, the default schema, and applying a view to rows.
import type {
  PageDatabaseSchema,
  PageDatabaseView,
  PageProperty,
  PagePropertyValue,
  PageRowProperties
} from './project-pages-database-types'
import { PAGE_DATABASE_LIMITS, TITLE_PROPERTY_ID } from './project-pages-database-types'

export type DatabaseRow = { id: string; title: string; properties: PageRowProperties }

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function defaultDatabaseSchema(): PageDatabaseSchema {
  return {
    version: 1,
    properties: [
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { id: 'todo', name: 'Not started' },
          { id: 'doing', name: 'In progress' },
          { id: 'done', name: 'Done' }
        ]
      }
    ],
    views: [
      { id: 'table', name: 'Table', kind: 'table' },
      { id: 'board', name: 'Board', kind: 'board', groupBy: 'status' }
    ]
  }
}

/** Returns the stored form of a value, or throws a message naming what is wrong. */
export function normalizePropertyValue(property: PageProperty, value: unknown): PagePropertyValue {
  if (value === null || value === undefined || value === '') {
    return property.type === 'checkbox' ? false : null
  }
  switch (property.type) {
    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`${property.name} takes text.`)
      }
      return value.slice(0, PAGE_DATABASE_LIMITS.text)
    case 'number': {
      const number = typeof value === 'string' ? Number(value) : value
      if (typeof number !== 'number' || !Number.isFinite(number)) {
        throw new Error(`${property.name} takes a number.`)
      }
      return number
    }
    case 'checkbox':
      if (typeof value !== 'boolean') {
        throw new Error(`${property.name} takes true or false.`)
      }
      return value
    case 'date':
      if (typeof value !== 'string' || !DATE.test(value)) {
        throw new Error(`${property.name} takes a date as YYYY-MM-DD.`)
      }
      return value
    case 'select': {
      const options = property.options ?? []
      const match = options.find((o) => o.id === value || o.name === value)
      if (!match) {
        throw new Error(
          `${property.name} takes one of: ${options.map((o) => o.name).join(', ') || '(no options)'}.`
        )
      }
      return match.id
    }
  }
}

function cellValue(row: DatabaseRow, propertyId: string): PagePropertyValue {
  return propertyId === TITLE_PROPERTY_ID ? row.title : (row.properties[propertyId] ?? null)
}

function isEmpty(value: PagePropertyValue): boolean {
  return value === null || value === '' || value === false
}

function matches(row: DatabaseRow, filter: NonNullable<PageDatabaseView['filter']>): boolean {
  const value = cellValue(row, filter.propertyId)
  switch (filter.op) {
    case 'empty':
      return isEmpty(value)
    case 'not_empty':
      return !isEmpty(value)
    case 'is':
      return value === (filter.value ?? null)
    case 'is_not':
      return value !== (filter.value ?? null)
    case 'contains':
      return String(value ?? '')
        .toLowerCase()
        .includes(String(filter.value ?? '').toLowerCase())
  }
}

function compare(a: PagePropertyValue, b: PagePropertyValue, order: string[]): number {
  if (isEmpty(a) || isEmpty(b)) {
    return Number(isEmpty(a)) - Number(isEmpty(b))
  }
  if (order.length > 0) {
    return order.indexOf(String(a)) - order.indexOf(String(b))
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  return String(a).localeCompare(String(b))
}

/** Rows a view shows, filtered then sorted; unsorted views keep page order. */
export function applyDatabaseView(
  rows: DatabaseRow[],
  schema: PageDatabaseSchema,
  view: PageDatabaseView
): DatabaseRow[] {
  const filtered = view.filter ? rows.filter((row) => matches(row, view.filter!)) : rows
  const sort = view.sort
  if (!sort) {
    return filtered
  }
  const property = schema.properties.find((p) => p.id === sort.propertyId)
  const order = property?.type === 'select' ? (property.options ?? []).map((o) => o.id) : []
  const sign = sort.direction === 'desc' ? -1 : 1
  return [...filtered].sort(
    (a, b) => sign * compare(cellValue(a, sort.propertyId), cellValue(b, sort.propertyId), order)
  )
}

/** Board columns: one per option, then rows with no value. */
export function groupRowsByOption(
  rows: DatabaseRow[],
  property: PageProperty
): { optionId: string | null; name: string; rows: DatabaseRow[] }[] {
  const options = property.options ?? []
  const known = new Set(options.map((o) => o.id))
  const columns = options.map((option) => ({
    optionId: option.id as string | null,
    name: option.name,
    rows: rows.filter((row) => row.properties[property.id] === option.id)
  }))
  const loose = rows.filter((row) => !known.has(String(row.properties[property.id] ?? '')))
  return [...columns, { optionId: null, name: 'No value', rows: loose }]
}
