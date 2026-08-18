// Shared contract for the muster tool handlers: injected deps, the per-call
// scope resolved from the caller's thread, and the MCP result helpers.

import type {
  ChatModeState,
  ChatThread,
  ChatWorkspace,
  ChatWorkspacePatch
} from '../../shared/chat-mode-types'

export const MAX_CHAT_CONNECTOR_NAME_LENGTH = 120
export const MAX_CHAT_CONNECTOR_TITLE_LENGTH = 200

export type ChatConnectorToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export type ChatConnectorToolDeps = {
  getChatState: () => ChatModeState
  updateWorkspace: (id: string, patch: ChatWorkspacePatch) => ChatWorkspace | null
  updateThread: (
    id: string,
    patch: Partial<Pick<ChatThread, 'title' | 'archived'>>
  ) => ChatThread | null
  deleteThread: (id: string) => boolean
  createWorkspace: (args: { name: string; directories: string[] }) => ChatWorkspace
  /** null target moves the thread to the ungrouped Chats section. */
  moveThread: (id: string, workspaceId: string | null) => ChatThread | null
  /** Resolved default chat model from settings; null = the CLI's own default. */
  getDefaultModel: () => string | null
  setDefaultModel: (modelId: string) => void
  /** Learned model registry ids (models the app has actually observed). */
  listLearnedModels: () => Promise<Record<string, unknown>>
  /** Blocks on the in-app destructive confirm; false = declined or timed out. */
  confirm: (args: { threadId: string; summary: string }) => Promise<boolean>
  stopThreadStream: (threadId: string) => void
  /** Notify every window that the chat store changed outside its own IPC. */
  broadcastChange: () => void
  directoryExists: (path: string) => boolean
}

export type ChatConnectorCallContext = {
  deps: ChatConnectorToolDeps
  thread: ChatThread
  workspace: ChatWorkspace | null
  /** Threads sharing the caller's scope (same workspace, or standalone set). */
  scopedThreads: ChatThread[]
}

export const toolOk = (text: string): ChatConnectorToolResult => ({
  content: [{ type: 'text', text }]
})

export const toolFail = (text: string): ChatConnectorToolResult => ({
  content: [{ type: 'text', text }],
  isError: true
})

export const NO_WORKSPACE_ERROR =
  "This chat isn't in a workspace, so there are no workspace settings here."
