// Project pages: Notion-like nested pages kept per Muster project.

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
}

export type ProjectPagesTree = {
  scopeKey: string
  pages: ProjectPageMeta[]
}

export type ProjectPageDocument = {
  meta: ProjectPageMeta
  markdown: string
}

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
