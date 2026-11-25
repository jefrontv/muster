// Agent access to the pages Trash: list it, and restore an entry the way its Restore button does.
import { ancestorsOf } from '../../shared/project-pages-tree'
import { trashedPages } from '../../shared/project-pages-trash'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import { ProjectPagesError, type ProjectPagesStore } from './project-pages-store'
import { pagePath, pageRow } from './project-pages-tool-target'

function trashRow(pages: ProjectPageMeta[], page: ProjectPageMeta): Record<string, unknown> {
  return {
    ...pageRow(pages, page),
    folder: pages.some((p) => p.parentId === page.id && p.archivedAt === page.archivedAt),
    archived_at: new Date(page.archivedAt ?? 0).toISOString()
  }
}

export function listTrash(pages: ProjectPageMeta[]): { count: number; pages: unknown[] } {
  const trashed = trashedPages(pages)
  return { count: trashed.length, pages: trashed.map((page) => trashRow(pages, page)) }
}

/** A Trash entry by id, title or path; pages that went in with a parent restore with it. */
export function resolveTrashedRef(pages: ProjectPageMeta[], ref: string): ProjectPageMeta {
  const trashed = trashedPages(pages)
  const byId = trashed.find((page) => page.id === ref)
  if (byId) {
    return byId
  }
  const page = pages.find((p) => p.id === ref)
  if (page) {
    const entry = ancestorsOf(pages, page.id).find((p) => trashed.includes(p))
    throw new ProjectPagesError(
      'invalid',
      entry
        ? `"${page.title || 'Untitled'}" went to Trash inside "${entry.title || 'Untitled'}" (${entry.id}); restore that.`
        : `"${page.title || 'Untitled'}" is not in Trash.`
    )
  }
  const needle = ref.trim().toLowerCase()
  const matches = trashed.filter(
    (p) =>
      (p.title || 'Untitled').toLowerCase() === needle ||
      pagePath(pages, p.id).toLowerCase() === needle
  )
  if (matches.length !== 1) {
    throw new ProjectPagesError(
      matches.length > 1 ? 'invalid' : 'not_found',
      matches.length > 1
        ? `More than one page in Trash matches "${ref}". Use an id: ${matches.map((p) => p.id).join(', ')}.`
        : `Nothing in Trash matches "${ref}". list_pages with archived: true shows it.`
    )
  }
  return matches[0]
}

export function restoreFromTrash(
  store: ProjectPagesStore,
  scopeKey: string,
  ref: string,
  author: ProjectPageAuthor
): Record<string, unknown> {
  const target = resolveTrashedRef(store.listPages(scopeKey).pages, ref)
  store.restorePage(scopeKey, target.id, author)
  const pages = store.listPages(scopeKey).pages
  const restored = pages.find((p) => p.id === target.id) ?? target
  return {
    page: pageRow(pages, restored),
    restored_to: restored.parentId ? pagePath(pages, restored.parentId) : 'top level'
  }
}
