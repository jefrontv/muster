// Chat mode's renderer state: the hydrated workspace/thread cache from the main-process
// store, the current selection, and the runtime-only map of live thread sessions.
// Sessions launch through chat-thread-session-launch, which fills threadSessions.

import type { StateCreator } from 'zustand'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import type { AppState } from '../types'

/** A live PTY-backed session for a thread. Runtime-only — never persisted. */
export type ChatThreadSession = {
  tabId: string
  leafId: string
  paneKey: string
  ptyId: string
}

export type ChatModeSlice = {
  chatWorkspaces: ChatWorkspace[]
  chatThreads: ChatThread[]
  chatModeHydrated: boolean
  activeChatWorkspaceId: string | null
  activeChatThreadId: string | null
  chatThreadSessions: Record<string, ChatThreadSession>
  hydrateChatMode: () => Promise<void>
  setActiveChatWorkspace: (id: string | null) => void
  setActiveChatThread: (id: string | null) => void
  createChatWorkspace: (args: { name: string; directories: string[] }) => Promise<ChatWorkspace>
  updateChatWorkspace: (
    id: string,
    patch: Partial<Pick<ChatWorkspace, 'name' | 'directories'>>
  ) => Promise<void>
  deleteChatWorkspace: (id: string) => Promise<void>
  createChatThread: (workspaceId: string, title?: string) => Promise<ChatThread | null>
  updateChatThread: (
    id: string,
    patch: Partial<
      Pick<
        ChatThread,
        'title' | 'claudeSessionId' | 'transcriptPath' | 'lastActivityAt' | 'archived'
      >
    >
  ) => Promise<void>
  deleteChatThread: (id: string) => Promise<void>
  setChatThreadSession: (threadId: string, session: ChatThreadSession | null) => void
}

export const createChatModeSlice: StateCreator<AppState, [], [], ChatModeSlice> = (set, get) => ({
  chatWorkspaces: [],
  chatThreads: [],
  chatModeHydrated: false,
  activeChatWorkspaceId: null,
  activeChatThreadId: null,
  chatThreadSessions: {},

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
        activeChatWorkspaceId: thread.workspaceId
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
    const session = get().chatThreadSessions[id]
    if (session) {
      // Why: the PTY is invisible; deleting the thread is the only close affordance.
      void window.api.pty.kill(session.ptyId).catch(() => undefined)
    }
    await window.api.chatMode.deleteThread(id)
    set((s) => {
      const { [id]: _dropped, ...remainingSessions } = s.chatThreadSessions
      return {
        chatThreads: s.chatThreads.filter((t) => t.id !== id),
        chatThreadSessions: remainingSessions,
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
    })
})
