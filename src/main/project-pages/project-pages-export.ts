// Writes a project's live pages to a folder as markdown: a page with subpages gets a folder of
// the same name, page links become relative file links, and database rows get front matter.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { PAGE_LINK_SCHEME } from '../../shared/project-pages-plain-text'
import { childrenOf } from '../../shared/project-pages-tree'
import type { PageDatabaseSchema } from '../../shared/project-pages-database-types'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesDatabases } from './project-pages-database-store'
import {
  linkPath,
  rewriteMarkdownLinks,
  safeFileName,
  uniqueName
} from './project-pages-file-names'
import type { ProjectPagesStore } from './project-pages-store'

function yamlValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function frontMatter(schema: PageDatabaseSchema, page: ProjectPageMeta): string {
  const lines = schema.properties.flatMap((property) => {
    const raw = page.properties?.[property.id] ?? null
    const value =
      property.type === 'select' ? (property.options?.find((o) => o.id === raw)?.name ?? null) : raw
    return value === null ? [] : [`${JSON.stringify(property.name)}: ${yamlValue(value)}`]
  })
  return lines.length > 0 ? `---\n${lines.join('\n')}\n---\n\n` : ''
}

export function exportProjectPages({
  store,
  databases,
  scopeKey,
  targetDir,
  filesDir = null
}: {
  store: ProjectPagesStore
  databases: ProjectPagesDatabases
  scopeKey: string
  targetDir: string
  /** The space's files/ folder; copied beside the pages so image links keep working. */
  filesDir?: string | null
}): { count: number } {
  const pages = store.listPages(scopeKey).pages.filter((page) => page.archivedAt === null)
  // Posix path of each page's file, relative to the export folder.
  const files = new Map<string, string>()
  const place = (parentId: string | null, folder: string): void => {
    const taken = new Set<string>()
    for (const page of childrenOf(pages, parentId)) {
      const name = uniqueName(safeFileName(page.title), taken)
      files.set(page.id, posix.join(folder, `${name}.md`))
      place(page.id, posix.join(folder, name))
    }
  }
  place(null, '')

  const schemas = new Map<string, PageDatabaseSchema>()
  const schemaFor = (databaseId: string): PageDatabaseSchema => {
    let schema = schemas.get(databaseId)
    if (!schema) {
      schema = databases.readDatabase(scopeKey, databaseId).schema
      schemas.set(databaseId, schema)
    }
    return schema
  }

  for (const page of pages) {
    const file = files.get(page.id)
    if (!file) {
      continue
    }
    const body = rewriteMarkdownLinks(store.readPage(scopeKey, page.id).markdown, (href) => {
      const target = href.startsWith(PAGE_LINK_SCHEME)
        ? files.get(href.slice(PAGE_LINK_SCHEME.length))
        : href.startsWith('files/') && filesDir
          ? href
          : undefined
      return target ? linkPath(posix.relative(posix.dirname(file), target)) : null
    })
    const parent = page.parentId ? pages.find((p) => p.id === page.parentId) : undefined
    const header = parent?.database ? frontMatter(schemaFor(parent.id), page) : ''
    const absolute = join(targetDir, ...file.split('/'))
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, `${header}# ${page.title.trim() || 'Untitled'}\n\n${body}`)
  }
  if (filesDir && existsSync(filesDir)) {
    cpSync(filesDir, join(targetDir, 'files'), { recursive: true })
  }
  return { count: files.size }
}
