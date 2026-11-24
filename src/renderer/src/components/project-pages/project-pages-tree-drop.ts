// Where a page dragged in the sidebar tree lands: before, inside or after the row under the pointer.
import { childrenOf, wouldCreateCycle } from '../../../../shared/project-pages-tree'
import type { ProjectPageMeta, ProjectPageMoveInput } from '../../../../shared/project-pages-types'

export type TreeDropZone = 'before' | 'inside' | 'after'

/** The top and bottom quarters of a row reorder; the middle nests. */
export function treeDropZone(offsetY: number, height: number): TreeDropZone {
  if (offsetY < height * 0.25) {
    return 'before'
  }
  return offsetY > height * 0.75 ? 'after' : 'inside'
}

/** The move for dropping dragId on overId, or null when the drop would change nothing or nest a page in itself. */
export function treeDropMove(
  pages: ProjectPageMeta[],
  dragId: string,
  overId: string,
  zone: TreeDropZone
): ProjectPageMoveInput | null {
  const drag = pages.find((page) => page.id === dragId)
  const over = pages.find((page) => page.id === overId)
  if (!drag || !over || dragId === overId) {
    return null
  }
  const parentId = zone === 'inside' ? over.id : over.parentId
  if (wouldCreateCycle(pages, dragId, parentId)) {
    return null
  }
  // Indexes count siblings without the dragged page, matching placePage.
  const siblings = childrenOf(pages, parentId).filter((page) => page.id !== dragId)
  const index =
    zone === 'inside'
      ? siblings.length
      : siblings.findIndex((page) => page.id === overId) + (zone === 'after' ? 1 : 0)
  const current = childrenOf(pages, drag.parentId).findIndex((page) => page.id === dragId)
  return drag.parentId === parentId && current === index ? null : { parentId, index }
}
