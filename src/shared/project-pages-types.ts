// Project pages: Notion-like nested pages kept per Muster project.
import type { PageRowProperties } from './project-pages-database-types'

export type ProjectPageAuthor =
  | { kind: 'user' }
  | {
      kind: 'agent'
      agent: string
      worktreeId?: string | null
      terminalHandle?: string | null
    }

export type ProjectPageMeta = {
  id: string
  parentId: string | null
  /** Position among siblings; lower first. */
  order: number
  title: string
  icon: string | null
  revision: number
  editedBy: ProjectPageAuthor
  createdAt: number
  updatedAt: number
  /** Set when the page or an ancestor was moved to the trash. */
  archivedAt: number | null
  /** The page is a database: its child pages are rows. */
  database?: boolean
  /** Property values when the page is a database row, keyed by property id. */
  properties?: PageRowProperties
}

export type ProjectPagesTree = {
  scopeKey: string
  pages: ProjectPageMeta[]
}

export type ProjectPageDocument = {
  meta: ProjectPageMeta
  markdown: string
  /** Set when a stale edit was merged with newer saves, so the editor must load the result. */
  merged?: boolean
}

export type ProjectPageRevision = { revision: number; savedAt: number }

export type ProjectPageSearchResult = { page: ProjectPageMeta; snippet: string }

export type ProjectPageCreateInput = {
  parentId?: string | null
  title?: string
  markdown?: string
}

export type ProjectPageUpdateInput = {
  /** The revision the edit started from; a newer stored revision is a conflict. */
  baseRevision: number
  title?: string
  icon?: string | null
  markdown?: string
  /** A stale edit is merged block by block with what was saved since, instead of refused. */
  merge?: boolean
}

export type ProjectPageMoveInput = {
  parentId: string | null
  /** Position among the new siblings, clamped to the end. */
  index: number
}

export type ProjectPagesErrorCode = 'not_found' | 'conflict' | 'invalid' | 'forbidden' | 'error'

export type ProjectPagesResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectPagesErrorCode; message: string; revision?: number }

/** Null when the user closed the folder picker. */
export type ProjectPagesTransfer = { count: number; path: string } | null

export type ProjectPagesChange = {
  scopeKey: string
  /** Null when the change touched the tree only. */
  pageId: string | null
  revision: number | null
  author: ProjectPageAuthor
}

export const PROJECT_PAGE_LIMITS = {
  title: 300,
  icon: 16,
  markdown: 200_000,
  pagesPerSpace: 5_000,
  historyPerPage: 20
} as const
