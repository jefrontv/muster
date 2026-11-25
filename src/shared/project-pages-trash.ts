// What the pages Trash shows: the agent tools and the sidebar list the same entries.
import type { ProjectPageMeta } from './project-pages-types'

/** Trashed pages that went in on their own, newest first; their children ride along. */
export function trashedPages(pages: ProjectPageMeta[]): ProjectPageMeta[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  return pages
    .filter((page) => {
      if (page.archivedAt === null) {
        return false
      }
      const parent = page.parentId ? byId.get(page.parentId) : undefined
      return !parent || parent.archivedAt !== page.archivedAt
    })
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
}
