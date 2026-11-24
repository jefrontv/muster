// Project pages owned by the GUI main process: the only writer, so revisions stay authoritative.
import type {
  ProjectPageAuthor,
  ProjectPageCreateInput,
  ProjectPageDocument,
  ProjectPageMeta,
  ProjectPageMoveInput,
  ProjectPageRevision,
  ProjectPagesChange,
  ProjectPagesErrorCode,
  ProjectPagesTree,
  ProjectPageUpdateInput
} from '../../shared/project-pages-types'
import { PROJECT_PAGE_LIMITS } from '../../shared/project-pages-types'
import {
  nextChildOrder,
  placePage,
  subtreeIds,
  wouldCreateCycle
} from '../../shared/project-pages-tree'
import { mergeMarkdownBlocks } from '../../shared/project-pages-block-merge'
import { createProjectPagesFiles, isPageId, newPageId } from './project-pages-files'
import { bodyAtRevision } from './project-pages-revision-history'

export class ProjectPagesError extends Error {
  constructor(
    readonly code: ProjectPagesErrorCode,
    message: string,
    readonly revision?: number
  ) {
    super(message)
  }
}

export type ProjectPagesStore = ReturnType<typeof createProjectPagesStore>

type Options = { rootDir: string; now?: () => number; newId?: () => string }

function cleanTitle(title: unknown): string {
  if (typeof title !== 'string') {
    return ''
  }
  return title
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, PROJECT_PAGE_LIMITS.title)
}

function checkMarkdown(markdown: string): string {
  if (markdown.length > PROJECT_PAGE_LIMITS.markdown) {
    throw new ProjectPagesError(
      'invalid',
      `A page is limited to ${PROJECT_PAGE_LIMITS.markdown} characters.`
    )
  }
  return markdown
}

export function createProjectPagesStore({ rootDir, now = Date.now, newId = newPageId }: Options) {
  const files = createProjectPagesFiles(rootDir)
  const listeners = new Set<(change: ProjectPagesChange) => void>()

  function emit(change: ProjectPagesChange): void {
    for (const listener of listeners) {
      listener(change)
    }
  }

  function load(
    scopeKey: string,
    create = false
  ): { dir: string | null; pages: ProjectPageMeta[] } {
    const dir = files.spaceDir(scopeKey, create)
    return { dir, pages: dir ? files.readTree(dir) : [] }
  }

  function find(pages: ProjectPageMeta[], pageId: string): ProjectPageMeta {
    const page = isPageId(pageId) ? pages.find((p) => p.id === pageId) : undefined
    if (!page) {
      throw new ProjectPagesError('not_found', 'No page with that id in this project.')
    }
    return page
  }

  function listPages(scopeKey: string): ProjectPagesTree {
    return { scopeKey, pages: load(scopeKey).pages }
  }

  function readPage(scopeKey: string, pageId: string): ProjectPageDocument {
    const { dir, pages } = load(scopeKey)
    const meta = find(pages, pageId)
    return { meta, markdown: dir ? files.readBody(dir, meta.id) : '' }
  }

  function createPage(
    scopeKey: string,
    input: ProjectPageCreateInput,
    author: ProjectPageAuthor
  ): ProjectPageDocument {
    const { dir, pages } = load(scopeKey, true)
    if (!dir) {
      throw new ProjectPagesError('error', 'Could not open the pages folder.')
    }
    if (pages.length >= PROJECT_PAGE_LIMITS.pagesPerSpace) {
      throw new ProjectPagesError('invalid', 'This project has reached the page limit.')
    }
    const parentId = input.parentId ?? null
    if (parentId !== null) {
      find(pages, parentId)
    }
    const markdown = checkMarkdown(input.markdown ?? '')
    const at = now()
    const meta: ProjectPageMeta = {
      id: newId(),
      parentId,
      order: nextChildOrder(pages, parentId),
      title: cleanTitle(input.title),
      icon: null,
      revision: 1,
      editedBy: author,
      createdAt: at,
      updatedAt: at,
      archivedAt: null
    }
    // Body first: a crash before the tree write leaves an orphan the next load recovers.
    files.writeBody(dir, meta.id, markdown)
    files.writeTree(dir, [...pages, meta])
    emit({ scopeKey, pageId: meta.id, revision: meta.revision, author })
    return { meta, markdown }
  }

  function updatePage(
    scopeKey: string,
    pageId: string,
    input: ProjectPageUpdateInput,
    author: ProjectPageAuthor
  ): ProjectPageDocument {
    const { dir, pages } = load(scopeKey)
    const current = find(pages, pageId)
    if (!dir) {
      throw new ProjectPagesError('not_found', 'No page with that id in this project.')
    }
    const before = files.readBody(dir, current.id)
    let markdown = input.markdown === undefined ? before : checkMarkdown(input.markdown)
    let merged = false
    if (input.baseRevision !== current.revision) {
      const base =
        input.merge && input.markdown !== undefined
          ? bodyAtRevision(files, dir, current.id, input.baseRevision, {
              revision: current.revision,
              markdown: before
            })
          : null
      const result = base === null ? null : mergeMarkdownBlocks(base, markdown, before)
      if (!result?.ok) {
        throw new ProjectPagesError(
          'conflict',
          `The page changed since revision ${input.baseRevision}; it is now at ${current.revision}.`,
          current.revision
        )
      }
      markdown = checkMarkdown(result.markdown)
      merged = true
    }
    const title = input.title === undefined ? current.title : cleanTitle(input.title)
    const icon =
      input.icon === undefined
        ? current.icon
        : input.icon?.slice(0, PROJECT_PAGE_LIMITS.icon) || null
    if (markdown === before && title === current.title && icon === current.icon) {
      return { meta: current, markdown, ...(merged ? { merged } : {}) }
    }
    const meta: ProjectPageMeta = {
      ...current,
      title,
      icon,
      revision: current.revision + 1,
      editedBy: author,
      updatedAt: now()
    }
    if (markdown !== before) {
      files.keepHistory(dir, current.id, current.revision, before)
      files.writeBody(dir, current.id, markdown)
    }
    files.writeTree(
      dir,
      pages.map((p) => (p.id === meta.id ? meta : p))
    )
    emit({ scopeKey, pageId: meta.id, revision: meta.revision, author })
    return { meta, markdown, ...(merged ? { merged } : {}) }
  }

  function movePage(
    scopeKey: string,
    pageId: string,
    input: ProjectPageMoveInput,
    author: ProjectPageAuthor
  ): ProjectPageMeta {
    const { dir, pages } = load(scopeKey)
    find(pages, pageId)
    if (input.parentId !== null) {
      find(pages, input.parentId)
    }
    if (!dir || wouldCreateCycle(pages, pageId, input.parentId)) {
      throw new ProjectPagesError('invalid', 'A page cannot move inside itself.')
    }
    const next = placePage(pages, pageId, input.parentId, input.index)
    files.writeTree(dir, next)
    emit({ scopeKey, pageId: null, revision: null, author })
    return find(next, pageId)
  }

  /** Trashes the page and everything under it; restoring brings the same set back. */
  function setArchived(
    scopeKey: string,
    pageId: string,
    archived: boolean,
    author: ProjectPageAuthor
  ): void {
    const { dir, pages } = load(scopeKey)
    const root = find(pages, pageId)
    if (!dir) {
      return
    }
    const ids = subtreeIds(pages, pageId)
    const stamp = archived ? now() : null
    const wasArchivedAt = root.archivedAt
    const next = pages.map((p) =>
      ids.has(p.id) && (archived ? p.archivedAt === null : p.archivedAt === wasArchivedAt)
        ? { ...p, archivedAt: stamp }
        : p
    )
    // A restored page whose parent is still in the trash moves to the top level.
    const parent = root.parentId ? pages.find((p) => p.id === root.parentId) : undefined
    const placed =
      !archived && parent?.archivedAt
        ? placePage(next, pageId, null, Number.MAX_SAFE_INTEGER)
        : next
    files.writeTree(dir, placed)
    emit({ scopeKey, pageId: null, revision: null, author })
  }

  return {
    listPages,
    readPage,
    createPage,
    updatePage,
    movePage,
    archivePage: (scopeKey: string, pageId: string, author: ProjectPageAuthor) =>
      setArchived(scopeKey, pageId, true, author),
    restorePage: (scopeKey: string, pageId: string, author: ProjectPageAuthor) =>
      setArchived(scopeKey, pageId, false, author),
    /** Kept earlier revisions of a page, newest first. */
    listRevisions: (scopeKey: string, pageId: string): ProjectPageRevision[] => {
      const { dir } = load(scopeKey)
      return dir && isPageId(pageId) ? files.listHistory(dir, pageId) : []
    },
    /** Body of an earlier revision, while it is still kept. */
    readRevision: (scopeKey: string, pageId: string, revision: number): string | null => {
      const { dir } = load(scopeKey)
      return dir && isPageId(pageId) ? files.readHistory(dir, pageId, revision) : null
    },
    onChanged(listener: (change: ProjectPagesChange) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
