// Chat mode's renderer state: the hydrated workspace/thread cache from the main-process
// store, the current selection, and the runtime-only map of live thread sessions.
// Sessions launch through chat-thread-session-launch, which fills threadSessions.

import type { StateCreator } from 'zustand'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import type { SessionOptionValue } from '../../../../shared/native-chat-session-options'
import type { AppState } from '../types'

/** A pending can_use_tool question from the stream, awaiting Approve/Decline. */
export type ChatThreadPermissionRequest = {
  requestId: string
  toolName: string
  /** Raw tool input JSON, rendered by the approval panel as-is. */
  input: unknown
}

/** A live stream-json session for a thread. Runtime-only — never persisted. */
export type ChatThreadSession = {
  tabId: string
  leafId: string
  paneKey: string
  /** Model/effort launch flags the launcher applied; the composer pickers show
   *  these since a headless pane has no terminal frame to scrape. */
  appliedSessionOptions?: Record<string, SessionOptionValue>
}

export type ChatModeSlice = {
  chatWorkspaces: ChatWorkspace[]
  chatThreads: ChatThread[]
  chatModeHydrated: boolean
  activeChatWorkspaceId: string | null
  activeChatThreadId: string | null
  chatThreadSessions: Record<string, ChatThreadSession>
  /** In-flight assistant text per thread, accumulated from stream deltas.
   *  `sealed` marks a completed message kept visible until the transcript
   *  catches up — clearing it eagerly flashes a gap before the real turn lands. */
  chatThreadStreamingText: Record<string, { text: string; sealed: boolean }>
  /** Pending tool-permission questions per thread, oldest first. */
  chatThreadPermissionRequests: Record<string, ChatThreadPermissionRequest[]>
  /** Tool names "Always allow this session" approved, per thread. Runtime-only;
   *  cleared with the session (exit event / thread delete). */
  chatThreadSessionAllowedTools: Record<string, string[]>
  /** Draft-first landing: the hero's text, sent once the thread's session is up. */
  chatThreadFirstMessage: Record<string, string>
  /** Tasks page shown inside the chat panel — the chat view never leaves for it. */
  chatTasksOpen: boolean
  setChatTasksOpen: (open: boolean) => void
  hydrateChatMode: () => Promise<void>
  setActiveChatWorkspace: (id: string | null) => void
  setActiveChatThread: (id: string | null) => void
  createChatWorkspace: (args: { name: string; directories: string[] }) => Promise<ChatWorkspace>
  updateChatWorkspace: (
    id: string,
    patch: Partial<Pick<ChatWorkspace, 'name' | 'directories' | 'icon' | 'color'>>
  ) => Promise<void>
  deleteChatWorkspace: (id: string) => Promise<void>
  createChatThread: (workspaceId: string | null, title?: string) => Promise<ChatThread | null>
  updateChatThread: (
    id: string,
    patch: Partial<
      Pick<
        ChatThread,
        | 'title'
        | 'claudeSessionId'
        | 'transcriptPath'
        | 'lastActivityAt'
        | 'lastVisitedAt'
        | 'lastCompletedAt'
        | 'archived'
      >
    >
  ) => Promise<void>
  deleteChatThread: (id: string) => Promise<void>
  setChatThreadSession: (threadId: string, session: ChatThreadSession | null) => void
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
  setChatThreadFirstMessage: (threadId: string, text: string) => void
  clearChatThreadFirstMessage: (threadId: string) => void
  appendChatThreadStreamingText: (threadId: string, text: string) => void
  sealChatThreadStreamingText: (threadId: string) => void
  clearChatThreadStreamingText: (threadId: string) => void
}

export const createChatModeSlice: StateCreator<AppState, [], [], ChatModeSlice> = (set, get) => ({
  chatWorkspaces: [],
  chatThreads: [],
  chatModeHydrated: false,
  activeChatWorkspaceId: null,
  activeChatThreadId: null,
  chatThreadSessions: {},
  chatThreadStreamingText: {},
  chatThreadPermissionRequests: {},
  chatThreadSessionAllowedTools: {},
  chatThreadFirstMessage: {},
  chatTasksOpen: false,

  setChatTasksOpen: (open) => set({ chatTasksOpen: open }),

  hydrateChatMode: async () => {
    const state = await window.api.chatMode.getState()
    set({
      chatWorkspaces: state.workspaces,
      chatThreads: state.threads,
      chatModeHydrated: true
    })
  },

  setActiveChatWorkspace: (id) =>
    set((s) => ({
      activeChatWorkspaceId: id,
      // Why: a thread from another workspace must not stay focused behind the switch.
      activeChatThreadId:
        id !== null && s.activeChatThreadId !== null
          ? s.chatThreads.find((t) => t.id === s.activeChatThreadId)?.workspaceId === id
            ? s.activeChatThreadId
            : null
          : s.activeChatThreadId
    })),

  setActiveChatThread: (id) =>
    set((s) => {
      const thread = id !== null ? s.chatThreads.find((t) => t.id === id) : null
      return {
        activeChatThreadId: id,
        // Picking a thread dismisses the embedded Tasks page — the panel shows one thing.
        ...(id !== null ? { chatTasksOpen: false } : {}),
        ...(thread ? { activeChatWorkspaceId: thread.workspaceId } : {})
      }
    }),

  createChatWorkspace: async (args) => {
    const workspace = await window.api.chatMode.createWorkspace(args)
    set((s) => ({
      chatWorkspaces: [...s.chatWorkspaces, workspace],
      activeChatWorkspaceId: workspace.id
    }))
    return workspace
  },

  updateChatWorkspace: async (id, patch) => {
    const updated = await window.api.chatMode.updateWorkspace(id, patch)
    if (updated) {
      set((s) => ({
        chatWorkspaces: s.chatWorkspaces.map((w) => (w.id === id ? updated : w))
      }))
    }
  },

  deleteChatWorkspace: async (id) => {
    await window.api.chatMode.deleteWorkspace(id)
    set((s) => ({
      chatWorkspaces: s.chatWorkspaces.filter((w) => w.id !== id),
      chatThreads: s.chatThreads.filter((t) => t.workspaceId !== id),
      activeChatWorkspaceId: s.activeChatWorkspaceId === id ? null : s.activeChatWorkspaceId,
      activeChatThreadId:
        s.chatThreads.find((t) => t.id === s.activeChatThreadId)?.workspaceId === id
          ? null
          : s.activeChatThreadId
    }))
  },

  createChatThread: async (workspaceId, title) => {
    const thread = await window.api.chatMode.createThread({
      workspaceId,
      ...(title ? { title } : {})
    })
    if (thread) {
      set((s) => ({
        chatThreads: [...s.chatThreads, thread],
        activeChatThreadId: thread.id,
        ...(thread.workspaceId !== null ? { activeChatWorkspaceId: thread.workspaceId } : {})
      }))
    }
    return thread
  },

  updateChatThread: async (id, patch) => {
    const updated = await window.api.chatMode.updateThread(id, patch)
    if (updated) {
      set((s) => ({
        chatThreads: s.chatThreads.map((t) => (t.id === id ? updated : t))
      }))
    }
  },

  deleteChatThread: async (id) => {
    if (get().chatThreadSessions[id]) {
      // Why: the session is invisible; deleting the thread is the only close affordance.
      void window.api.chatThreadStream.stop(id).catch(() => undefined)
    }
    await window.api.chatMode.deleteThread(id)
    set((s) => {
      const { [id]: _dropped, ...remainingSessions } = s.chatThreadSessions
      const { [id]: _droppedText, ...remainingStreamingText } = s.chatThreadStreamingText
      const { [id]: _droppedRequests, ...remainingRequests } = s.chatThreadPermissionRequests
      const { [id]: _droppedAllowed, ...remainingAllowed } = s.chatThreadSessionAllowedTools
      const { [id]: _droppedFirst, ...remainingFirstMessages } = s.chatThreadFirstMessage
      return {
        chatThreads: s.chatThreads.filter((t) => t.id !== id),
        chatThreadSessions: remainingSessions,
        chatThreadStreamingText: remainingStreamingText,
        chatThreadPermissionRequests: remainingRequests,
        chatThreadSessionAllowedTools: remainingAllowed,
        chatThreadFirstMessage: remainingFirstMessages,
        activeChatThreadId: s.activeChatThreadId === id ? null : s.activeChatThreadId
      }
    })
  },

  setChatThreadSession: (threadId, session) =>
    set((s) => {
      if (session === null) {
        const { [threadId]: _dropped, ...remaining } = s.chatThreadSessions
        return { chatThreadSessions: remaining }
      }
      return { chatThreadSessions: { ...s.chatThreadSessions, [threadId]: session } }
    }),

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

  setChatThreadFirstMessage: (threadId, text) =>
    set((s) => ({
      chatThreadFirstMessage: { ...s.chatThreadFirstMessage, [threadId]: text }
    })),

  clearChatThreadFirstMessage: (threadId) =>
    set((s) => {
      if (!(threadId in s.chatThreadFirstMessage)) {
        return {}
      }
      const { [threadId]: _dropped, ...remaining } = s.chatThreadFirstMessage
      return { chatThreadFirstMessage: remaining }
    }),

  appendChatThreadStreamingText: (threadId, text) =>
    set((s) => {
      const current = s.chatThreadStreamingText[threadId]
      // A delta after a sealed message starts the next message's accumulation.
      const nextText = current && !current.sealed ? current.text + text : text
      return {
        chatThreadStreamingText: {
          ...s.chatThreadStreamingText,
          [threadId]: { text: nextText, sealed: false }
        }
      }
    }),

  sealChatThreadStreamingText: (threadId) =>
    set((s) => {
      const current = s.chatThreadStreamingText[threadId]
      if (!current || current.sealed) {
        return {}
      }
      return {
        chatThreadStreamingText: {
          ...s.chatThreadStreamingText,
          [threadId]: { ...current, sealed: true }
        }
      }
    }),

  clearChatThreadStreamingText: (threadId) =>
    set((s) => {
      if (!(threadId in s.chatThreadStreamingText)) {
        return {}
      }
      const { [threadId]: _dropped, ...remaining } = s.chatThreadStreamingText
      return { chatThreadStreamingText: remaining }
    })
})
