// Agent tools for database pages. Properties go in and out by name; select values by option name.
import { applyDatabaseView, type DatabaseRow } from '../../shared/project-pages-database-query'
import type {
  PageDatabaseSchema,
  PageDatabaseView,
  PageProperty,
  PageViewFilterOp,
  ProjectPageDatabase
} from '../../shared/project-pages-database-types'
import { TITLE_PROPERTY_ID } from '../../shared/project-pages-database-types'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesDatabases } from './project-pages-database-store'
import { ProjectPagesError } from './project-pages-store'

export const PROJECT_PAGES_DATABASE_OPS = [
  'query_database',
  'set_properties',
  'make_database'
] as const
export type ProjectPagesDatabaseOp = (typeof PROJECT_PAGES_DATABASE_OPS)[number]

const MAX_ROWS = 200
const TYPES = ['text', 'number', 'select', 'checkbox', 'date'] as const

export function isProjectPagesDatabaseOp(op: string): op is ProjectPagesDatabaseOp {
  return PROJECT_PAGES_DATABASE_OPS.includes(op as ProjectPagesDatabaseOp)
}

export type DatabaseOpContext = {
  databases: ProjectPagesDatabases | undefined
  scopeKey: string
  author: ProjectPageAuthor
  project: { id: string; name: string }
  args: Record<string, unknown>
  pageRef: (key: string) => ProjectPageMeta
}

function invalid(message: string): ProjectPagesError {
  return new ProjectPagesError('invalid', message)
}

function propertyByName(schema: PageDatabaseSchema, name: unknown): string {
  if (typeof name !== 'string') {
    throw invalid('A property name is required.')
  }
  if (name.toLowerCase() === TITLE_PROPERTY_ID) {
    return TITLE_PROPERTY_ID
  }
  const match = schema.properties.find((p) => p.id === name || p.name === name)
  if (!match) {
    throw invalid(
      `No property "${name}". Properties: ${schema.properties.map((p) => p.name).join(', ')}.`
    )
  }
  return match.id
}

function named(schema: PageDatabaseSchema, meta: ProjectPageMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const property of schema.properties) {
    const value = meta.properties?.[property.id] ?? null
    out[property.name] =
      property.type === 'select'
        ? (property.options?.find((o) => o.id === value)?.name ?? null)
        : value
  }
  return out
}

function describeSchema(schema: PageDatabaseSchema): unknown[] {
  return schema.properties.map((p) => ({
    name: p.name,
    type: p.type,
    ...(p.type === 'select' ? { options: (p.options ?? []).map((o) => o.name) } : {})
  }))
}

function chosenView(
  database: ProjectPageDatabase,
  args: Record<string, unknown>
): PageDatabaseView {
  const { schema } = database
  const wanted = typeof args.view === 'string' ? args.view : null
  const base = schema.views.find((v) => v.id === wanted || v.name === wanted) ?? schema.views[0]
  const view: PageDatabaseView = { ...base }
  const filter = args.filter as Record<string, unknown> | undefined
  if (filter && typeof filter === 'object') {
    const propertyId = propertyByName(schema, filter.property)
    const property = schema.properties.find((p) => p.id === propertyId)
    const raw = filter.value
    const value =
      property?.type === 'select'
        ? (property.options?.find((o) => o.name === raw || o.id === raw)?.id ?? raw)
        : raw
    view.filter = {
      propertyId,
      op: (filter.op as PageViewFilterOp) ?? 'is',
      ...(value === undefined ? {} : { value: value as string | number | boolean })
    }
  }
  const sort = args.sort as Record<string, unknown> | undefined
  if (sort && typeof sort === 'object') {
    view.sort = {
      propertyId: propertyByName(schema, sort.property),
      direction: sort.direction === 'desc' ? 'desc' : 'asc'
    }
  }
  return view
}

/** A property named like an existing one replaces it in place, keeping its id and matching options. */
function mergeProperties(existing: PageProperty[], added: PageProperty[]): PageProperty[] {
  const merged = [...existing]
  for (const property of added) {
    const at = merged.findIndex((p) => p.name.toLowerCase() === property.name.toLowerCase())
    if (at === -1) {
      merged.push(property)
      continue
    }
    const old = merged[at]
    const kept = new Set<string>()
    const options = property.options?.map((option) => {
      const same = old.options?.find((o) => o.name.toLowerCase() === option.name.toLowerCase())
      kept.add(same?.id ?? '')
      return same ?? option
    })
    // New option ids must not reuse an id an old option kept.
    let next = 1
    const fresh = (): string => {
      while (kept.has(`o${next}`)) {
        next += 1
      }
      kept.add(`o${next}`)
      return `o${next}`
    }
    merged[at] = {
      ...property,
      id: old.id,
      ...(options
        ? { options: options.map((o) => (old.options?.includes(o) ? o : { ...o, id: fresh() })) }
        : {})
    }
  }
  return merged
}

function newProperties(raw: unknown, existing: PageProperty[]): PageProperty[] {
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    throw invalid('properties must be a list of {name, type, options?}.')
  }
  const taken = new Set(existing.map((p) => p.id))
  const slug = (name: string): string => {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 30) || 'prop'
    let candidate = base
    for (let i = 2; taken.has(candidate) || candidate === TITLE_PROPERTY_ID; i++) {
      candidate = `${base}_${i}`
    }
    taken.add(candidate)
    return candidate
  }
  return raw.map((entry) => {
    const input = (entry ?? {}) as Record<string, unknown>
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const type = TYPES.find((t) => t === input.type)
    if (!name || !type) {
      throw invalid(`Each property needs a name and a type: ${TYPES.join(', ')}.`)
    }
    const options = Array.isArray(input.options) ? input.options.map(String) : []
    return {
      id: slug(name),
      name,
      type,
      ...(type === 'select'
        ? { options: options.map((option, i) => ({ id: `o${i + 1}`, name: option })) }
        : {})
    }
  })
}

/** Sets a new row's property values given in the same create call; adds nothing when none were. */
export function createdRowProperties(
  ctx: DatabaseOpContext,
  meta: ProjectPageMeta
): { properties?: unknown } {
  if (ctx.args.properties === undefined) {
    return {}
  }
  const args = { page: meta.id, properties: ctx.args.properties }
  const set = runProjectPagesDatabaseOp('set_properties', { ...ctx, args, pageRef: () => meta })
  return { properties: (set as { properties: unknown }).properties }
}

export function runProjectPagesDatabaseOp(
  op: ProjectPagesDatabaseOp,
  ctx: DatabaseOpContext
): unknown {
  const { databases, scopeKey, author, project, args } = ctx
  if (!databases) {
    throw new ProjectPagesError('error', 'This Muster build has no databases.')
  }
  switch (op) {
    case 'make_database': {
      const page = ctx.pageRef('page')
      let database = databases.enableDatabase(scopeKey, page.id, author)
      const added = newProperties(args.properties, database.schema.properties)
      if (added.length > 0) {
        const properties = mergeProperties(database.schema.properties, added)
        database = databases.updateSchema(
          scopeKey,
          page.id,
          { ...database.schema, properties },
          author
        )
      }
      return {
        project,
        database: { id: page.id, title: page.title },
        properties: describeSchema(database.schema)
      }
    }
    case 'query_database': {
      const page = ctx.pageRef('database')
      const database = databases.readDatabase(scopeKey, page.id)
      const view = chosenView(database, args)
      const rows: DatabaseRow[] = database.rows.map((r) => ({
        id: r.id,
        title: r.title,
        properties: r.properties ?? {}
      }))
      const shown = applyDatabaseView(rows, database.schema, view)
      const byId = new Map(database.rows.map((r) => [r.id, r]))
      return {
        project,
        database: { id: page.id, title: page.title },
        properties: describeSchema(database.schema),
        view: view.name,
        count: shown.length,
        rows: shown.slice(0, MAX_ROWS).map((r) => ({
          id: r.id,
          title: r.title,
          properties: named(database.schema, byId.get(r.id)!)
        }))
      }
    }
    case 'set_properties': {
      const page = ctx.pageRef('page')
      const patch = args.properties
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw invalid('properties must be an object of property name to value.')
      }
      const meta = databases.setProperties(
        scopeKey,
        page.id,
        patch as Record<string, unknown>,
        author
      )
      const parent = databases.readDatabase(scopeKey, meta.parentId!)
      return {
        project,
        page: { id: meta.id, title: meta.title },
        properties: named(parent.schema, meta)
      }
    }
  }
}
