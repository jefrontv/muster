// Chat mode's persisted domain: non-technical workspaces (name + directories) holding chat
// threads. Messages are never stored here — they live in the agent's own transcript files;
// threads keep only the pointers needed to resume and cold-render a session.

import type { RepoIcon } from './repo-icon'

export type ChatWorkspace = {
  id: string
  name: string
  /** Absolute paths. directories[0] is the primary directory (the agent's cwd);
   *  the rest are granted via --add-dir. */
  directories: string[]
  /** Same icon model as projects (lucide/emoji/image); null or absent = default glyph. */
  icon?: RepoIcon | null
  /** Hex accent color, validated like a repo badge color. */
  color?: string
  /** Bound ActiveCollab project; task pickers and new threads inherit it. */
  activeCollabProject?: { id: number; name: string } | null
  createdAt: number
  updatedAt: number
}

export type ChatThread = {
  id: string
  /** Null = a standalone chat in the ungrouped "Chats" section. */
  workspaceId: string | null
  /** User-set, or derived from the first prompt once one is sent. */
  title: string
  agent: 'claude'
  /** The agent's own session id, captured from agent hooks; null until the first
   *  hook report. Drives --resume when the thread reopens after the PTY died. */
  claudeSessionId: string | null
  /** Authoritative transcript path from the hook. Preferred over reconstructing
   *  from the session id, which recent Claude Code versions diverge from the path. */
  transcriptPath: string | null
  createdAt: number
  lastActivityAt: number
  /** When the user last had this thread open in a focused window. Absent =
   *  never visited, which counts as read (T3 rule). */
  lastVisitedAt?: number
  /** When the latest turn completed; with lastVisitedAt drives the unread "Done". */
  lastCompletedAt?: number
  /** Model's context window (tokens) from the CLI's last result record;
   *  persisted so the meter is right before the first turn of a new app run. */
  contextWindow?: number
  /** Manual sidebar position (drag-drop); absent rows key on -createdAt. */
  sortOrder?: number
  /** Linked ActiveCollab task; drives the thread header strip + row badge. */
  activeCollabTask?: { projectId: number; taskId: number } | null
  archived?: boolean
}

export type ChatModeState = {
  version: 1
  workspaces: ChatWorkspace[]
  threads: ChatThread[]
}

export const EMPTY_CHAT_MODE_STATE: ChatModeState = { version: 1, workspaces: [], threads: [] }
