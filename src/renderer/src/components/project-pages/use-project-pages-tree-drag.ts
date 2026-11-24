// Drag a page in the sidebar tree onto another row to nest it, or onto a row's edge to reorder.
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ProjectPageMeta, ProjectPageMoveInput } from '../../../../shared/project-pages-types'
import { treeDropMove, treeDropZone, type TreeDropZone } from './project-pages-tree-drop'

const PAGE_DRAG_TYPE = 'application/x-muster-page'
const ROW_ATTR = 'data-page-drop-id'

export type ProjectPagesTreeDrag = {
  dragId: string | null
  over: { id: string; zone: TreeDropZone } | null
  rowProps: (pageId: string) => React.HTMLAttributes<HTMLDivElement> & {
    draggable: boolean
    [ROW_ATTR]: string
  }
}

function dropAt(
  pages: ProjectPageMeta[],
  dragId: string,
  row: Element,
  clientY: number
): { zone: TreeDropZone; move: ProjectPageMoveInput } | null {
  const overId = row.getAttribute(ROW_ATTR)
  const rect = row.getBoundingClientRect()
  const zone = treeDropZone(clientY - rect.top, rect.height)
  const move = overId ? treeDropMove(pages, dragId, overId, zone) : null
  return move ? { zone, move } : null
}

export function useProjectPagesTreeDrag(
  pages: ProjectPageMeta[],
  onMove: (pageId: string, move: ProjectPageMoveInput) => void
): ProjectPagesTreeDrag {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<ProjectPagesTreeDrag['over']>(null)
  const latest = useRef({ pages, onMove })
  latest.current = { pages, onMove }

  // Preload swallows native drops before React sees them, so the drop commits from a capture listener.
  useEffect(() => {
    if (!dragId) {
      return undefined
    }
    const drop = (event: DragEvent): void => {
      const row = (event.target as Element | null)?.closest?.(`[${ROW_ATTR}]`)
      const found = row ? dropAt(latest.current.pages, dragId, row, event.clientY) : null
      if (found) {
        event.preventDefault()
        latest.current.onMove(dragId, found.move)
      }
      setDragId(null)
      setOver(null)
    }
    document.addEventListener('drop', drop, true)
    return () => document.removeEventListener('drop', drop, true)
  }, [dragId])

  const rowProps = (pageId: string): ReturnType<ProjectPagesTreeDrag['rowProps']> => ({
    draggable: true,
    [ROW_ATTR]: pageId,
    onDragStart: (event) => {
      event.dataTransfer.setData(PAGE_DRAG_TYPE, pageId)
      event.dataTransfer.effectAllowed = 'move'
      setDragId(pageId)
    },
    onDragOver: (event) => {
      const found = dragId ? dropAt(pages, dragId, event.currentTarget, event.clientY) : null
      if (!found) {
        setOver((current) => (current?.id === pageId ? null : current))
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (over?.id !== pageId || over.zone !== found.zone) {
        setOver({ id: pageId, zone: found.zone })
      }
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOver((current) => (current?.id === pageId ? null : current))
      }
    },
    onDragEnd: () => {
      setDragId(null)
      setOver(null)
    }
  })

  return { dragId, over, rowProps }
}
