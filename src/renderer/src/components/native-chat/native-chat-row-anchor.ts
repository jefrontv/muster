// Keeps what the reader is looking at in place when rows above it change: a page
// prepends, the loading row comes and goes, or windowed rows get measured. The
// anchor is the first visible row's top in content coordinates, which wheel
// scrolling never changes; a correction adds the anchor's shift to the live
// scrollTop, so a wheel tick that landed in between is kept.

import type { NativeChatTimelineRow } from './native-chat-timeline-rows'

export const NATIVE_CHAT_ROW_ANCHOR_ATTR = 'data-row-anchor'

/** Rows recorded past the first visible one, in case it is rekeyed or removed. */
const ANCHOR_CANDIDATES = 6

export type NativeChatRowAnchor = { id: string; top: number }

/** Message rows anchor on the message id; reply row keys follow their turn, which a prepend can regroup. */
export function nativeChatRowAnchorId(row: NativeChatTimelineRow): string {
  return row.kind === 'message' ? `m:${row.message.id}` : row.key
}

/** Rows in document order with their content-relative top and bottom. */
export type NativeChatRowBox = { id: string; top: number; bottom: number }

/** The first rows at or below the viewport top (content coordinates). */
export function captureRowAnchors(
  rows: readonly NativeChatRowBox[],
  viewportTop: number
): NativeChatRowAnchor[] {
  const anchors: NativeChatRowAnchor[] = []
  for (const row of rows) {
    if (row.bottom <= viewportTop) {
      continue
    }
    anchors.push({ id: row.id, top: row.top })
    if (anchors.length >= ANCHOR_CANDIDATES) {
      break
    }
  }
  return anchors
}

/** How far the first surviving anchor moved; 0 when none can be found. */
export function rowAnchorShift(
  anchors: readonly NativeChatRowAnchor[],
  locate: (id: string) => number | null
): number {
  for (const anchor of anchors) {
    const top = locate(anchor.id)
    if (top !== null) {
      return top - anchor.top
    }
  }
  return 0
}
