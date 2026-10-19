// The live chat-stream child per thread, shared by the lifecycle module
// (chat-thread-stream) and the per-thread actions (chat-thread-stream-actions).

import type { ChildProcess } from 'node:child_process'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import type { ChatThreadMessageQueue } from './chat-thread-message-queue'
import type { ChatThreadEngineLink } from './chat-thread-stream-engine'

export type StreamEntry = {
  child: ChildProcess
  /** True once the renderer asked for the stop; suppresses every later event (exit included) so a
   *  stopped or superseded child never races the thread's next session. */
  stopping: boolean
  /** Settles when the child closes; a relaunch waits on it. */
  closed: Promise<void>
  /** can_use_tool requests awaiting a renderer verdict, by request id. The input
   *  is kept so an allow without updatedInput echoes it back; the tool name so a
   *  reloaded renderer can rebuild the prompt. Entries are denied on stop so the
   *  CLI never hangs on an unanswerable question. */
  pendingPermissionRequests: Map<string, { toolName: string; input: unknown }>
  /** Outgoing control_request id counter (interrupts) — unique per child. */
  controlRequestCounter: number
  /** Revokes the muster MCP token and deletes the per-thread tmp files; runs once. */
  cleanup: (() => void) | null
  /** Renderer-facing event sink for this child (coalesced, pending-permission aware). */
  emit: (event: ChatThreadStreamEvent) => void
  /** Messages sent while a turn runs; drains as turns end. */
  queue: ChatThreadMessageQueue
  engine: ChatThreadEngineLink | null
  /** Last stdout record or stdin write; the idle reaper measures from it. */
  lastActivityAt: number
  /** Stop after IDLE_STREAM_MS with nothing going on (R14); off while the old chat view runs. */
  idleReap: boolean
}

export const registry = new Map<string, StreamEntry>()

export function writeStdinLine(entry: StreamEntry, payload: unknown): boolean {
  const stdin = entry.child.stdin
  if (entry.stopping || !stdin || stdin.destroyed || !stdin.writable) {
    return false
  }
  try {
    stdin.write(`${JSON.stringify(payload)}\n`)
  } catch {
    return false
  }
  entry.lastActivityAt = Date.now()
  return true
}
