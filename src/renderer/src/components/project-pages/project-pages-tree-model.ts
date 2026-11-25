// Nested view of a space's flat page list for the sidebar tree.
import { childrenOf } from '../../../../shared/project-pages-tree'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

export { trashedPages } from '../../../../shared/project-pages-trash'

export type PageTreeNode = { page: ProjectPageMeta; children: PageTreeNode[] }

/** Live pages as a tree; a title filter keeps matches plus the pages leading to them. */
export function buildPageTree(pages: ProjectPageMeta[], query = ''): PageTreeNode[] {
  const live = pages.filter((page) => page.archivedAt === null)
  const needle = query.trim().toLowerCase()
  const build = (parentId: string | null, depth: number): PageTreeNode[] =>
    depth > 64
      ? []
      : childrenOf(live, parentId).flatMap((page) => {
          const children = build(page.id, depth + 1)
          const matches = !needle || page.title.toLowerCase().includes(needle)
          return matches || children.length > 0 ? [{ page, children }] : []
        })
  return build(null, 0)
}

/** Ids of the pages above `pageId`, nearest first; stops on a cycle. */
export function ancestorIds(pages: ProjectPageMeta[], pageId: string): string[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const ids: string[] = []
  let parentId = byId.get(pageId)?.parentId ?? null
  while (parentId && parentId !== pageId && !ids.includes(parentId)) {
    ids.push(parentId)
    parentId = byId.get(parentId)?.parentId ?? null
  }
  return ids
}

export function pageTitle(page: Pick<ProjectPageMeta, 'title'>): string {
  return page.title || 'Untitled'
}
