// On-disk layout for project pages: spaces.json, then per space a tree.json and one markdown file per page.
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { PROJECT_PAGE_LIMITS } from '../../shared/project-pages-types'

type SpaceIndex = { version: 1; spaces: Record<string, string> }
type TreeFile = { version: 1; pages: ProjectPageMeta[] }

const PAGE_ID = /^[A-Za-z0-9_-]{1,64}$/

export function isPageId(value: unknown): value is string {
  return typeof value === 'string' && PAGE_ID.test(value)
}

export function newPageId(): string {
  return `p_${randomUUID().replace(/-/g, '')}`
}

function writeAtomic(file: string, data: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  } catch {
    return null
  }
}

export type ProjectPagesFiles = ReturnType<typeof createProjectPagesFiles>

export function createProjectPagesFiles(rootDir: string) {
  const indexFile = join(rootDir, 'spaces.json')

  /** Space directory for a scope, created on first use. Ids, never titles, name files on disk. */
  function spaceDir(scopeKey: string, create: boolean): string | null {
    const index = readJson<SpaceIndex>(indexFile) ?? { version: 1, spaces: {} }
    let spaceId = index.spaces[scopeKey]
    if (!spaceId || !isPageId(spaceId)) {
      if (!create) {
        return null
      }
      spaceId = `s_${randomUUID().replace(/-/g, '')}`
      writeAtomic(
        indexFile,
        JSON.stringify({ ...index, spaces: { ...index.spaces, [scopeKey]: spaceId } }, null, 2)
      )
    }
    return join(rootDir, spaceId)
  }

  function pageFile(dir: string, pageId: string): string {
    return join(dir, 'pages', `${pageId}.md`)
  }

  function readTree(dir: string): ProjectPageMeta[] {
    const tree = readJson<TreeFile>(join(dir, 'tree.json'))
    const pages = Array.isArray(tree?.pages) ? tree.pages.filter((p) => isPageId(p?.id)) : []
    return adoptOrphans(dir, pages)
  }

  // A page file the tree lost (a crash between two writes) comes back at the top level.
  function adoptOrphans(dir: string, pages: ProjectPageMeta[]): ProjectPageMeta[] {
    const pagesDir = join(dir, 'pages')
    if (!existsSync(pagesDir)) {
      return pages
    }
    const known = new Set(pages.map((p) => p.id))
    const orphans = readdirSync(pagesDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.slice(0, -3))
      .filter((id) => isPageId(id) && !known.has(id))
    if (orphans.length === 0) {
      return pages
    }
    const now = Date.now()
    return [
      ...pages,
      ...orphans.map((id, i) => ({
        id,
        parentId: null,
        order: Number.MAX_SAFE_INTEGER - orphans.length + i,
        title: 'Recovered page',
        icon: null,
        revision: 1,
        editedBy: { kind: 'user' as const },
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      }))
    ]
  }

  function writeTree(dir: string, pages: ProjectPageMeta[]): void {
    writeAtomic(
      join(dir, 'tree.json'),
      JSON.stringify({ version: 1, pages } satisfies TreeFile, null, 2)
    )
  }

  function readBody(dir: string, pageId: string): string {
    try {
      return readFileSync(pageFile(dir, pageId), 'utf-8')
    } catch {
      return ''
    }
  }

  function writeBody(dir: string, pageId: string, markdown: string): void {
    writeAtomic(pageFile(dir, pageId), markdown)
  }

  /** Keeps the body a revision replaced, pruned to the newest few. */
  function keepHistory(dir: string, pageId: string, revision: number, markdown: string): void {
    const historyDir = join(dir, 'history', pageId)
    writeAtomic(join(historyDir, `${revision}.md`), markdown)
    const revisions = readdirSync(historyDir)
      .map((name) => Number.parseInt(name, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)
    for (const old of revisions.slice(PROJECT_PAGE_LIMITS.historyPerPage)) {
      rmSync(join(historyDir, `${old}.md`), { force: true })
    }
  }

  function readHistory(dir: string, pageId: string, revision: number): string | null {
    try {
      return readFileSync(join(dir, 'history', pageId, `${revision}.md`), 'utf-8')
    } catch {
      return null
    }
  }

  return { spaceDir, readTree, writeTree, readBody, writeBody, keepHistory, readHistory }
}
