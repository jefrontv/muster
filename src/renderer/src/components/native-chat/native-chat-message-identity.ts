// Keeps message object identity across transcript re-reads. Loading an older page
// re-reads the whole window and rebuilds every message, which would re-render (and
// re-parse the markdown of) every memoized row; unchanged messages keep their
// previous object instead.

import { useMemo, useRef } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false
  }
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return (
      a.length === other.length && a.every((item, index) => structurallyEqual(item, other[index]))
    )
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && structurallyEqual(left[key], right[key]))
  )
}

/** `next`, with each message equal to the previous one of the same id swapped for it. */
export function reuseStableMessages(
  previous: readonly NativeChatMessage[],
  next: readonly NativeChatMessage[]
): readonly NativeChatMessage[] {
  if (previous.length === 0 || previous === next) {
    return next
  }
  const byId = new Map(previous.map((message) => [message.id, message]))
  let changed = previous.length !== next.length
  const out = next.map((message, index) => {
    const prior = byId.get(message.id)
    const kept = prior && structurallyEqual(prior, message) ? prior : message
    if (kept !== previous[index]) {
      changed = true
    }
    return kept
  })
  // Nothing moved: hand back the previous array so list-level memos skip too.
  return changed ? out : previous
}

/** The session with message objects carried over from its previous render where unchanged. */
export function useStableSessionMessages<T extends { messages: NativeChatMessage[] }>(
  session: T
): T {
  const previous = useRef<readonly NativeChatMessage[]>([])
  return useMemo(() => {
    const messages = reuseStableMessages(previous.current, session.messages)
    previous.current = messages
    return messages === session.messages
      ? session
      : { ...session, messages: messages as NativeChatMessage[] }
  }, [session])
}
