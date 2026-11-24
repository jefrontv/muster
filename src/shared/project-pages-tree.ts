// Pure operations on a space's flat page list: children, subtrees, moves.
import type { ProjectPageMeta } from './project-pages-types'

export function childrenOf(pages: ProjectPageMeta[], parentId: string | null): ProjectPageMeta[] {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/** The page and every page below it. */
export function subtreeIds(pages: ProjectPageMeta[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id)
        grew = true
      }
    }
  }
  return ids
}

export function nextChildOrder(pages: ProjectPageMeta[], parentId: string | null): number {
  const siblings = childrenOf(pages, parentId)
  return (siblings.at(-1)?.order ?? -1) + 1
}

/** True when moving `pageId` under `parentId` would put it inside itself. */
export function wouldCreateCycle(
  pages: ProjectPageMeta[],
  pageId: string,
  parentId: string | null
): boolean {
  return parentId !== null && subtreeIds(pages, pageId).has(parentId)
}

/** Returns the list with `pageId` placed at `index` under `parentId` and siblings renumbered. */
export function placePage(
  pages: ProjectPageMeta[],
  pageId: string,
  parentId: string | null,
  index: number
): ProjectPageMeta[] {
  const moving = pages.find((page) => page.id === pageId)
  if (!moving) {
    return pages
  }
  const siblings = childrenOf(pages, parentId).filter((page) => page.id !== pageId)
  const at = Math.max(0, Math.min(Math.trunc(index), siblings.length))
  siblings.splice(at, 0, { ...moving, parentId })
  const placed = new Map(siblings.map((page, order) => [page.id, { ...page, order }]))
  return pages.map((page) => placed.get(page.id) ?? page)
}

/** Breadcrumb from the top-level page down to `pageId`. */
export function ancestorsOf(pages: ProjectPageMeta[], pageId: string): ProjectPageMeta[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const trail: ProjectPageMeta[] = []
  let current = byId.get(pageId)
  while (current && trail.length <= pages.length) {
    trail.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return trail
}
