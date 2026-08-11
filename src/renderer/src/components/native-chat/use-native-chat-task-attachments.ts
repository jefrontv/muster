// Composer state for attached ActiveCollab tasks. Picked tasks ride as chips —
// never as draft text — and become AC# reference lines (token + MCP fetch
// context) appended to the outgoing prompt at send, mirroring file attachments.

import { useCallback, useRef, useState } from 'react'
import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

export type NativeChatTaskAttachment = {
  taskId: number
  projectId: number
  name: string
}

export function useNativeChatTaskAttachments(scopeKey: string): {
  taskAttachments: NativeChatTaskAttachment[]
  attachTask: (task: NativeChatTaskAttachment) => void
  removeTaskAttachment: (taskId: number) => void
  clearTaskAttachments: () => void
} {
  const [taskAttachments, setTaskAttachments] = useState<NativeChatTaskAttachment[]>(() =>
    readTaskAttachmentCache(scopeKey)
  )

  // Scope-key change = composer reused for another pane; reload that pane's
  // chips during render (same pattern as image/file attachments).
  const lastScopeKey = useRef(scopeKey)
  if (lastScopeKey.current !== scopeKey) {
    lastScopeKey.current = scopeKey
    setTaskAttachments(readTaskAttachmentCache(scopeKey))
  }

  const update = useCallback(
    (updater: (previous: NativeChatTaskAttachment[]) => NativeChatTaskAttachment[]) => {
      setTaskAttachments((prev) => {
        const next = updater(prev)
        writeTaskAttachmentCache(scopeKey, next)
        return next
      })
    },
    [scopeKey]
  )

  return {
    taskAttachments,
    attachTask: useCallback(
      (task) =>
        update((prev) =>
          prev.some((existing) => existing.taskId === task.taskId) ? prev : [...prev, task]
        ),
      [update]
    ),
    removeTaskAttachment: useCallback(
      (taskId) => update((prev) => prev.filter((task) => task.taskId !== taskId)),
      [update]
    ),
    clearTaskAttachments: useCallback(() => update(() => []), [update])
  }
}

const taskAttachmentCache = new Map<string, NativeChatTaskAttachment[]>()

/**
 * Chips waiting for a composer that does not exist yet, keyed by tab.
 *
 * "Discuss in chat" knows the task before the thread has a session, let alone a pane, so it cannot
 * write to the scope cache directly — scope keys are `<tabId>:<paneId>` and the pane id is assigned
 * on mount. The first composer to open on that tab claims the seed.
 */
const pendingTaskAttachmentsByTabId = new Map<string, NativeChatTaskAttachment[]>()

export function seedTaskAttachmentsForTab(
  tabId: string,
  attachments: readonly NativeChatTaskAttachment[]
): void {
  if (attachments.length === 0) {
    pendingTaskAttachmentsByTabId.delete(tabId)
    return
  }
  pendingTaskAttachmentsByTabId.set(tabId, [...attachments])
}

function readTaskAttachmentCache(scopeKey: string): NativeChatTaskAttachment[] {
  const cached = taskAttachmentCache.get(scopeKey)
  if (cached) {
    return [...cached]
  }
  // Claimed once: a chip the user removes must not come back when the composer remounts.
  const tabId = scopeKey.split(':')[0] ?? ''
  const seeded = pendingTaskAttachmentsByTabId.get(tabId)
  if (!seeded) {
    return []
  }
  pendingTaskAttachmentsByTabId.delete(tabId)
  writeTaskAttachmentCache(scopeKey, seeded)
  return [...seeded]
}

function writeTaskAttachmentCache(
  scopeKey: string,
  attachments: readonly NativeChatTaskAttachment[]
): void {
  if (attachments.length === 0) {
    taskAttachmentCache.delete(scopeKey)
    return
  }
  setBoundedScopeCacheEntry(taskAttachmentCache, scopeKey, [...attachments])
}
