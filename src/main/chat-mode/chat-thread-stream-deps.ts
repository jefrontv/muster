// Injected collaborators for the chat thread stream: the renderer sink, the
// spawner and the env/MCP sources, so tests can drive a fake child.

import type { ChildProcess } from 'node:child_process'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'

export type ChatThreadStreamSender = {
  send: (channel: string, payload: ChatThreadStreamEvent) => void
  isDestroyed: () => boolean
}

export type ChatThreadStreamSpawn = (
  command: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv }
) => ChildProcess

export type ChatThreadStreamDeps = {
  spawn?: ChatThreadStreamSpawn
  /** Live hook-server coordinates (ORCA_AGENT_HOOK_*), same source as PTY spawns. */
  hookEnv?: () => Record<string, string>
  /** Chat-connector MCP coordinates: register mints the thread's bearer token
   *  before spawn, revoke retires it on stop/close (token-matched, so a stale
   *  child's late close can't kill a relaunch's fresh token). */
  mcp?: {
    register: (threadId: string) => { url: string; token: string } | null
    revoke: (threadId: string, token: string) => void
  }
  /** What a login shell would contribute; null means spawn one instead. */
  loginShellEnv?: () => Record<string, string> | null
}
