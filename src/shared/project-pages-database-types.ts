// Database pages: a page whose child pages are rows with typed properties.
import type { ProjectPageMeta } from './project-pages-types'

export type PagePropertyType = 'text' | 'number' | 'select' | 'checkbox' | 'date'

export type PagePropertyOption = { id: string; name: string }

export type PageProperty = {
  id: string
  name: string
  type: PagePropertyType
  /** Choices for select properties. */
  options?: PagePropertyOption[]
}

/** select stores an option id; date stores YYYY-MM-DD. */
export type PagePropertyValue = string | number | boolean | null

export type PageRowProperties = Record<string, PagePropertyValue>

export type PageViewFilterOp = 'is' | 'is_not' | 'contains' | 'empty' | 'not_empty'

export type PageDatabaseView = {
  id: string
  name: string
  kind: 'table' | 'board'
  /** Board column property; must be a select. */
  groupBy?: string | null
  sort?: { propertyId: string; direction: 'asc' | 'desc' } | null
  filter?: { propertyId: string; op: PageViewFilterOp; value?: PagePropertyValue } | null
}

export type PageDatabaseSchema = {
  version: 1
  properties: PageProperty[]
  views: PageDatabaseView[]
}

export const PAGE_DATABASE_LIMITS = {
  properties: 40,
  options: 60,
  views: 12,
  name: 100,
  text: 2_000
} as const

export type ProjectPageDatabase = {
  page: ProjectPageMeta
  schema: PageDatabaseSchema
  /** Live child pages, in page order. */
  rows: ProjectPageMeta[]
}

/** The title is not a stored property but sorts and filters like one. */
export const TITLE_PROPERTY_ID = 'title'
