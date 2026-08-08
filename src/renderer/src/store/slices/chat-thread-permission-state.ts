// Tool-permission state for chat-mode stream sessions: the pending
// can_use_tool queue per thread and the session-scoped "always allow" list.
// Composed into ChatModeSlice; lifetimes match the thread's live session.

import type { StateCreator } from 'zustand'
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
  addChatThreadPermissionRequest: (threadId: string, request: ChatThreadPermissionRequest) => void
  removeChatThreadPermissionRequest: (threadId: string, requestId: string) => void
  clearChatThreadPermissionRequests: (threadId: string) => void
  /** Answer a pending request: removes it optimistically, then tells main. */
  respondChatThreadPermission: (
    threadId: string,
    requestId: string,
    behavior: 'allow' | 'deny'
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

  addChatThreadPermissionRequest: (threadId, request) =>
    set((s) => {
      const queue = s.chatThreadPermissionRequests[threadId] ?? []
      // Why: a replayed record must not duplicate an already-queued question.
      if (queue.some((r) => r.requestId === request.requestId)) {
        return {}
      }
      return {
        chatThreadPermissionRequests: {
          ...s.chatThreadPermissionRequests,
          [threadId]: [...queue, request]
        }
      }
    }),

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
      if (!(threadId in s.chatThreadPermissionRequests)) {
        return {}
      }
      const { [threadId]: _dropped, ...remaining } = s.chatThreadPermissionRequests
      return { chatThreadPermissionRequests: remaining }
    }),

  respondChatThreadPermission: (threadId, requestId, behavior) => {
    // Optimistic removal: the composer moves on immediately; main writes the
    // verdict and the CLI tolerates a stale id if the turn was interrupted.
    get().removeChatThreadPermissionRequest(threadId, requestId)
    void window.api.chatThreadStream
      .respondPermission({ threadId, requestId, behavior })
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
