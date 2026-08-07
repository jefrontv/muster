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
  createdAt: number
  updatedAt: number
}

export type ChatThread = {
  id: string
  workspaceId: string
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
  archived?: boolean
}

export type ChatModeState = {
  version: 1
  workspaces: ChatWorkspace[]
  threads: ChatThread[]
}

export const EMPTY_CHAT_MODE_STATE: ChatModeState = { version: 1, workspaces: [], threads: [] }
