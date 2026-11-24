// Database pages on top of the page store: the schema file per database page and the
// property values its rows keep in tree.json.
import { childrenOf } from '../../shared/project-pages-tree'
import {
  defaultDatabaseSchema,
  normalizePropertyValue
} from '../../shared/project-pages-database-query'
import { normalizeDatabaseSchema } from '../../shared/project-pages-database-schema'
import type {
  PageDatabaseSchema,
  PageRowProperties,
  ProjectPageDatabase
} from '../../shared/project-pages-database-types'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import { createProjectPagesFiles, isPageId } from './project-pages-files'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'

export type ProjectPagesDatabases = ReturnType<typeof createProjectPagesDatabases>

export function createProjectPagesDatabases({
  rootDir,
  store,
  now = Date.now
}: {
  rootDir: string
  store: ProjectPagesStore
  now?: () => number
}) {
  const files = createProjectPagesFiles(rootDir)

  function space(scopeKey: string): { dir: string; pages: ProjectPageMeta[] } {
    const dir = files.spaceDir(scopeKey, false)
    if (!dir) {
      throw new ProjectPagesError('not_found', 'This project has no pages yet.')
    }
    return { dir, pages: files.readTree(dir) }
  }

  function livePage(pages: ProjectPageMeta[], pageId: string): ProjectPageMeta {
    const page = isPageId(pageId) ? pages.find((p) => p.id === pageId) : undefined
    if (!page || page.archivedAt !== null) {
      throw new ProjectPagesError('not_found', 'That page does not exist or is in the trash.')
    }
    return page
  }

  function schemaOf(dir: string, pageId: string): PageDatabaseSchema {
    const stored = files.readDatabase(dir, pageId)
    try {
      return stored ? normalizeDatabaseSchema(stored) : defaultDatabaseSchema()
    } catch {
      return defaultDatabaseSchema()
    }
  }

  function readDatabase(scopeKey: string, pageId: string): ProjectPageDatabase {
    const { dir, pages } = space(scopeKey)
    const page = livePage(pages, pageId)
    if (!page.database) {
      throw new ProjectPagesError('invalid', `"${page.title || 'Untitled'}" is not a database.`)
    }
    const rows = childrenOf(pages, page.id).filter((row) => row.archivedAt === null)
    return { page, schema: schemaOf(dir, page.id), rows }
  }

  /** Turns a page into a database; its child pages become rows. */
  function enableDatabase(
    scopeKey: string,
    pageId: string,
    author: ProjectPageAuthor
  ): ProjectPageDatabase {
    const { dir, pages } = space(scopeKey)
    const page = livePage(pages, pageId)
    if (!page.database) {
      if (!files.readDatabase(dir, page.id)) {
        files.writeDatabase(dir, page.id, defaultDatabaseSchema())
      }
      files.writeTree(
        dir,
        pages.map((p) => (p.id === page.id ? { ...p, database: true, updatedAt: now() } : p))
      )
      store.notify({ scopeKey, pageId: null, revision: null, author })
    }
    return readDatabase(scopeKey, pageId)
  }

  function updateSchema(
    scopeKey: string,
    pageId: string,
    raw: unknown,
    author: ProjectPageAuthor
  ): ProjectPageDatabase {
    const { dir } = space(scopeKey)
    readDatabase(scopeKey, pageId)
    let schema: PageDatabaseSchema
    try {
      schema = normalizeDatabaseSchema(raw)
    } catch (error) {
      throw new ProjectPagesError('invalid', (error as Error).message)
    }
    files.writeDatabase(dir, pageId, schema)
    store.notify({ scopeKey, pageId: null, revision: null, author })
    return readDatabase(scopeKey, pageId)
  }

  /** Sets a row's values; keys are property ids or names, null clears. */
  function setProperties(
    scopeKey: string,
    pageId: string,
    patch: Record<string, unknown>,
    author: ProjectPageAuthor
  ): ProjectPageMeta {
    const { dir, pages } = space(scopeKey)
    const row = livePage(pages, pageId)
    const parent = row.parentId ? pages.find((p) => p.id === row.parentId) : undefined
    if (!parent?.database) {
      throw new ProjectPagesError('invalid', 'Only pages inside a database have properties.')
    }
    const schema = schemaOf(dir, parent.id)
    const next: PageRowProperties = { ...row.properties }
    for (const [key, value] of Object.entries(patch)) {
      const property = schema.properties.find((p) => p.id === key || p.name === key)
      if (!property) {
        const names = schema.properties.map((p) => p.name).join(', ')
        throw new ProjectPagesError('invalid', `No property "${key}". This database has: ${names}.`)
      }
      try {
        next[property.id] = normalizePropertyValue(property, value)
      } catch (error) {
        throw new ProjectPagesError('invalid', (error as Error).message)
      }
    }
    const updated = { ...row, properties: next, updatedAt: now(), editedBy: author }
    files.writeTree(
      dir,
      pages.map((p) => (p.id === row.id ? updated : p))
    )
    store.notify({ scopeKey, pageId: row.id, revision: row.revision, author })
    return updated
  }

  function addRow(
    scopeKey: string,
    databaseId: string,
    input: { title?: string; markdown?: string; properties?: Record<string, unknown> },
    author: ProjectPageAuthor
  ): ProjectPageMeta {
    readDatabase(scopeKey, databaseId)
    const created = store.createPage(
      scopeKey,
      { parentId: databaseId, title: input.title, markdown: input.markdown },
      author
    )
    return input.properties && Object.keys(input.properties).length > 0
      ? setProperties(scopeKey, created.meta.id, input.properties, author)
      : created.meta
  }

  return { readDatabase, enableDatabase, updateSchema, setProperties, addRow }
}
