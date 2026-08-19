// Boots the agent for a hero draft while the user is still typing it.
//
// Why: the sidebar's "new chat" button creates its thread immediately, so
// ChatThreadView mounts and launches the session during typing. The hero
// created its thread only on send, which pushed the whole cold start — login
// shell, the CLI's own boot, MCP connect — after the user pressed enter and
// read as the chat hanging before it did anything.
//
// The warmed thread stays out of the active slot so the hero is not swapped out
// mid-sentence; submit adopts it. Abandoning the draft discards it, since an
// unsent warm thread is an empty row in the sidebar and a live child process.

import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { launchChatThreadSession } from '@/lib/chat-thread-session-launch'
import type { ChatThread } from '../../../../shared/chat-mode-types'

export type ChatDraftPrewarm = {
  /** The warm thread for this workspace, or null when nothing is ready yet. */
  claim: () => ChatThread | null
  /** Give up the warm thread without using it. */
  discard: () => void
}

export function useChatDraftPrewarm(input: {
  /** Non-empty once the user has actually started writing. */
  draft: string
  workspaceId: string | null
}): ChatDraftPrewarm {
  const { draft, workspaceId } = input
  const threadRef = useRef<ChatThread | null>(null)
  const startingRef = useRef(false)
  const claimedRef = useRef(false)

  const discard = useCallback(() => {
    const thread = threadRef.current
    threadRef.current = null
    if (thread && !claimedRef.current) {
      void useAppStore.getState().deleteChatThread(thread.id)
    }
  }, [])

  const claim = useCallback((): ChatThread | null => {
    const thread = threadRef.current
    if (!thread) {
      return null
    }
    claimedRef.current = true
    return thread
  }, [])

  const wanted = draft.trim() !== ''
  const warmedWorkspaceRef = useRef(workspaceId)

  useEffect(() => {
    // Workspace changes are handled here rather than in their own effect: a
    // separate one runs after this and would delete the thread this pass just
    // created for the new workspace.
    if (warmedWorkspaceRef.current !== workspaceId) {
      warmedWorkspaceRef.current = workspaceId
      // Warmed against the old workspace's directories and brief — unusable.
      discard()
    }
    if (!wanted || threadRef.current !== null || startingRef.current) {
      return
    }
    const store = useAppStore.getState()
    const workspace =
      workspaceId === null ? null : store.chatWorkspaces.find((w) => w.id === workspaceId)
    // A workspace id that no longer resolves would launch in the wrong place.
    if (workspaceId !== null && !workspace) {
      return
    }
    startingRef.current = true
    void (async () => {
      try {
        // activate: false keeps the hero mounted — the point is to warm the
        // agent without yanking the composer out from under the typist.
        const thread = await store.createChatThread(workspaceId, undefined, { activate: false })
        if (!thread) {
          return
        }
        threadRef.current = thread
        const result = await launchChatThreadSession({ thread, workspace: workspace ?? null })
        if (result) {
          useAppStore.getState().setChatThreadSession(thread.id, result)
        }
      } catch {
        // A failed warm-up costs nothing: submit falls back to creating the
        // thread the old way and the user sees the original timing.
        const failed = threadRef.current
        threadRef.current = null
        if (failed) {
          void useAppStore.getState().deleteChatThread(failed.id)
        }
      } finally {
        startingRef.current = false
      }
    })()
  }, [wanted, workspaceId, discard])

  useEffect(() => discard, [discard])

  return { claim, discard }
}
