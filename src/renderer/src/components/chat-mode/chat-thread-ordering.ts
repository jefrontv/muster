// Manual ordering for sidebar chat lists. Every thread has an effective sort
// key: an explicit drag-assigned `sortOrder`, else `-createdAt` so new chats
// land on top without migrating existing rows. Drag-drop writes a midpoint key
// so only the moved thread persists a change.

import type { ChatThread } from '../../../../shared/chat-mode-types'

/** Gap used when dropping at the very top/bottom of a list. */
const EDGE_GAP = 60_000

export function chatThreadSortKey(thread: Pick<ChatThread, 'sortOrder' | 'createdAt'>): number {
  return thread.sortOrder ?? -thread.createdAt
}

/** Pinned rows form their own block at the top; within each block the manual
 *  sort key still decides, so a drag inside a block behaves exactly as before. */
export function sortChatThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => {
    const pinDelta = Number(b.pinned === true) - Number(a.pinned === true)
    return pinDelta !== 0 ? pinDelta : chatThreadSortKey(a) - chatThreadSortKey(b)
  })
}

/** The `sortOrder` the dragged thread needs to land before/after `targetId`
 *  within `orderedRows` (already display-sorted). Null = no-op drop. */
export function computeDropSortOrder(
  orderedRows: ChatThread[],
  draggedId: string,
  targetId: string,
  placeAfter: boolean
): number | null {
  if (draggedId === targetId) {
    return null
  }
  const withoutDragged = orderedRows.filter((t) => t.id !== draggedId)
  const targetIndex = withoutDragged.findIndex((t) => t.id === targetId)
  if (targetIndex < 0) {
    return null
  }
  const insertIndex = placeAfter ? targetIndex + 1 : targetIndex
  const before = withoutDragged[insertIndex - 1]
  const after = withoutDragged[insertIndex]
  if (before && after) {
    return (chatThreadSortKey(before) + chatThreadSortKey(after)) / 2
  }
  if (after) {
    return chatThreadSortKey(after) - EDGE_GAP
  }
  if (before) {
    return chatThreadSortKey(before) + EDGE_GAP
  }
  return null
}
