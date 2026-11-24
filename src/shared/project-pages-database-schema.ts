// Checks a database schema from the UI or an agent and returns a clean copy.
import type {
  PageDatabaseSchema,
  PageDatabaseView,
  PageProperty,
  PagePropertyOption,
  PagePropertyType,
  PageViewFilterOp
} from './project-pages-database-types'
import { PAGE_DATABASE_LIMITS, TITLE_PROPERTY_ID } from './project-pages-database-types'

const TYPES: PagePropertyType[] = ['text', 'number', 'select', 'checkbox', 'date']
const FILTER_OPS: PageViewFilterOp[] = ['is', 'is_not', 'contains', 'empty', 'not_empty']
const ID = /^[A-Za-z0-9_-]{1,40}$/

type Raw = Record<string, unknown>

function record(value: unknown, what: string): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${what} must be an object.`)
  }
  return value as Raw
}

function list(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} must be a list.`)
  }
  if (value.length > max) {
    throw new Error(`${what} can hold at most ${max} entries.`)
  }
  return value
}

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new Error(`${what} needs an id of letters, digits, _ or -.`)
  }
  return value
}

function name(value: unknown, what: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    throw new Error(`${what} needs a name.`)
  }
  return text.slice(0, PAGE_DATABASE_LIMITS.name)
}

function unique<T extends { id: string }>(items: T[], what: string): T[] {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`${what} id "${item.id}" is used twice.`)
    }
    seen.add(item.id)
  }
  return items
}

function property(raw: unknown): PageProperty {
  const input = record(raw, 'A property')
  const type = input.type as PagePropertyType
  if (!TYPES.includes(type)) {
    throw new Error(`Property type must be one of ${TYPES.join(', ')}.`)
  }
  const propertyId = id(input.id, 'A property')
  if (propertyId === TITLE_PROPERTY_ID) {
    throw new Error('"title" is reserved for the page title.')
  }
  const result: PageProperty = { id: propertyId, name: name(input.name, 'A property'), type }
  if (type === 'select') {
    const options = list(input.options ?? [], 'Options', PAGE_DATABASE_LIMITS.options).map(
      (option): PagePropertyOption => {
        const entry = record(option, 'An option')
        return { id: id(entry.id, 'An option'), name: name(entry.name, 'An option') }
      }
    )
    result.options = unique(options, 'Option')
  }
  return result
}

function view(raw: unknown, properties: PageProperty[]): PageDatabaseView {
  const input = record(raw, 'A view')
  const kind = input.kind === 'board' ? 'board' : input.kind === 'table' ? 'table' : null
  if (!kind) {
    throw new Error('A view kind must be table or board.')
  }
  const known = (propertyId: unknown): string | null =>
    typeof propertyId === 'string' &&
    (propertyId === TITLE_PROPERTY_ID || properties.some((p) => p.id === propertyId))
      ? propertyId
      : null
  const result: PageDatabaseView = {
    id: id(input.id, 'A view'),
    name: name(input.name, 'A view'),
    kind
  }
  const groupBy = known(input.groupBy)
  if (kind === 'board') {
    const select = properties.find((p) => p.id === groupBy && p.type === 'select')
    result.groupBy = select?.id ?? properties.find((p) => p.type === 'select')?.id ?? null
  }
  const sort = input.sort ? record(input.sort, 'A sort') : null
  if (sort && known(sort.propertyId)) {
    result.sort = {
      propertyId: sort.propertyId as string,
      direction: sort.direction === 'desc' ? 'desc' : 'asc'
    }
  }
  const filter = input.filter ? record(input.filter, 'A filter') : null
  if (filter && known(filter.propertyId) && FILTER_OPS.includes(filter.op as PageViewFilterOp)) {
    const value = filter.value
    result.filter = {
      propertyId: filter.propertyId as string,
      op: filter.op as PageViewFilterOp,
      ...(['string', 'number', 'boolean'].includes(typeof value)
        ? { value: value as string | number | boolean }
        : {})
    }
  }
  return result
}

export function normalizeDatabaseSchema(raw: unknown): PageDatabaseSchema {
  const input = record(raw, 'The schema')
  const properties = unique(
    list(input.properties, 'Properties', PAGE_DATABASE_LIMITS.properties).map(property),
    'Property'
  )
  const views = unique(
    list(input.views, 'Views', PAGE_DATABASE_LIMITS.views).map((v) => view(v, properties)),
    'View'
  )
  if (views.length === 0) {
    throw new Error('A database needs at least one view.')
  }
  return { version: 1, properties, views }
}
