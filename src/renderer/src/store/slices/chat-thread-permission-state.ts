// Tool-permission state for chat-mode stream sessions: the pending
// can_use_tool queue per thread and the session-scoped "always allow" list.
// Composed into ChatModeSlice; lifetimes match the thread's live session.

import type { StateCreator } from 'zustand'
import { isAskUserQuestionTool } from '../../../../shared/agent-question-answered-intent'
import type { AppState } from '../types'

/** A pending can_use_tool question from the stream, awaiting Approve/Decline. */
export type ChatThreadPermissionRequest = {
  requestId: string
  toolName: string
  /** Raw tool input JSON, rendered by the approval panel as-is. */
  input: unknown
}

export type ChatThreadPermissionSlice = {
  /** Pending tool-permission questions per thread, oldest first. */
  chatThreadPermissionRequests: Record<string, ChatThreadPermissionRequest[]>
  /** Tool names "Always allow this session" approved, per thread. Runtime-only;
   *  cleared with the session (exit event / thread delete). */
  chatThreadSessionAllowedTools: Record<string, string[]>
  /** Full-access (auto-approve every tool) per thread. Runtime-only; dies with
   *  the session like the allowed-tools list. */
  chatThreadFullAccess: Record<string, boolean>
  /** Request ids already answered this session, so a replay cannot resurrect a
   *  card nothing would remove. Runtime-only; cleared with the session. */
  chatThreadAnsweredPermissions: Record<string, string[]>
  addChatThreadPermissionRequest: (threadId: string, request: ChatThreadPermissionRequest) => void
  removeChatThreadPermissionRequest: (threadId: string, requestId: string) => void
  clearChatThreadPermissionRequests: (threadId: string) => void
  /** Answer a pending request: removes it optimistically, then tells main. */
  respondChatThreadPermission: (
    threadId: string,
    requestId: string,
    behavior: 'allow' | 'deny',
    message?: string
  ) => void
  allowChatThreadToolForSession: (threadId: string, toolName: string) => void
  clearChatThreadSessionAllowedTools: (threadId: string) => void
  setChatThreadFullAccess: (threadId: string, enabled: boolean) => void
}

export const createChatThreadPermissionSlice: StateCreator<
  AppState,
  [],
  [],
  ChatThreadPermissionSlice
> = (set, get) => ({
  chatThreadPermissionRequests: {},
  chatThreadSessionAllowedTools: {},
  chatThreadFullAccess: {},
  chatThreadAnsweredPermissions: {},

  addChatThreadPermissionRequest: (threadId, request) => {
    // The auto-approve verdict lives here, not at the call sites: the queue has
    // more than one producer (live stream events and the reload replay), and a
    // producer that forgets the check shows an approval card under full access.
    const state = get()
    if (
      !isAskUserQuestionTool(request.toolName) &&
      (state.settings?.nativeChatPermissionMode === 'full' ||
        state.chatThreadFullAccess[threadId] === true ||
        state.chatThreadSessionAllowedTools[threadId]?.includes(request.toolName) === true)
    ) {
      state.respondChatThreadPermission(threadId, request.requestId, 'allow')
      return
    }
    set((s) => {
      const queue = s.chatThreadPermissionRequests[threadId] ?? []
      // Why: a replayed record must not duplicate an already-queued question.
      if (queue.some((r) => r.requestId === request.requestId)) {
        return {}
      }
      // Why: the replay re-reads what main still holds, which can include a
      // request the live listener answered while the read was in flight. Nothing
      // would ever remove that card, so drop it here.
      if (s.chatThreadAnsweredPermissions[threadId]?.includes(request.requestId) === true) {
        return {}
      }
      return {
        chatThreadPermissionRequests: {
          ...s.chatThreadPermissionRequests,
          [threadId]: [...queue, request]
        }
      }
    })
  },

  removeChatThreadPermissionRequest: (threadId, requestId) =>
    set((s) => {
      const queue = s.chatThreadPermissionRequests[threadId]
      if (!queue?.some((r) => r.requestId === requestId)) {
        return {}
      }
      const remaining = queue.filter((r) => r.requestId !== requestId)
      if (remaining.length === 0) {
        const { [threadId]: _dropped, ...rest } = s.chatThreadPermissionRequests
        return { chatThreadPermissionRequests: rest }
      }
      return {
        chatThreadPermissionRequests: { ...s.chatThreadPermissionRequests, [threadId]: remaining }
      }
    }),

  clearChatThreadPermissionRequests: (threadId) =>
    set((s) => {
      const { [threadId]: _answered, ...answeredRest } = s.chatThreadAnsweredPermissions
      const answeredUpdate =
        threadId in s.chatThreadAnsweredPermissions
          ? { chatThreadAnsweredPermissions: answeredRest }
          : {}
      if (!(threadId in s.chatThreadPermissionRequests)) {
        return answeredUpdate
      }
      const { [threadId]: _dropped, ...remaining } = s.chatThreadPermissionRequests
      return { chatThreadPermissionRequests: remaining, ...answeredUpdate }
    }),

  respondChatThreadPermission: (threadId, requestId, behavior, message) => {
    // Optimistic removal: the composer moves on immediately; main writes the
    // verdict and the CLI tolerates a stale id if the turn was interrupted.
    get().removeChatThreadPermissionRequest(threadId, requestId)
    set((s) => {
      const answered = s.chatThreadAnsweredPermissions[threadId] ?? []
      return answered.includes(requestId)
        ? {}
        : {
            chatThreadAnsweredPermissions: {
              ...s.chatThreadAnsweredPermissions,
              [threadId]: [...answered, requestId]
            }
          }
    })
    void window.api.chatThreadStream
      .respondPermission({
        threadId,
        requestId,
        behavior,
        ...(typeof message === 'string' && message !== '' ? { message } : {})
      })
      .catch(() => undefined)
  },

  allowChatThreadToolForSession: (threadId, toolName) =>
    set((s) => {
      const allowed = s.chatThreadSessionAllowedTools[threadId] ?? []
      if (allowed.includes(toolName)) {
        return {}
      }
      return {
        chatThreadSessionAllowedTools: {
          ...s.chatThreadSessionAllowedTools,
          [threadId]: [...allowed, toolName]
        }
      }
    }),

  clearChatThreadSessionAllowedTools: (threadId) =>
    set((s) => {
      if (!(threadId in s.chatThreadSessionAllowedTools)) {
        return {}
      }
      const { [threadId]: _dropped, ...remaining } = s.chatThreadSessionAllowedTools
      return { chatThreadSessionAllowedTools: remaining }
    }),

  setChatThreadFullAccess: (threadId, enabled) =>
    set((s) => {
      if (!enabled) {
        if (!(threadId in s.chatThreadFullAccess)) {
          return {}
        }
        const { [threadId]: _dropped, ...remaining } = s.chatThreadFullAccess
        return { chatThreadFullAccess: remaining }
      }
      return { chatThreadFullAccess: { ...s.chatThreadFullAccess, [threadId]: true } }
    })
})
