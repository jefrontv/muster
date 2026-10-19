// Ties one stream child to the ChatEngine. Every call is scoped to that child's
// control client, so a stopped or replaced child can no longer touch the thread.

import type { ChatThreadMessageQueueSnapshot } from '../../shared/chat-thread-stream-types'
import type { ChatEngine } from './engine/chat-engine'

/** Cold starts connect MCP servers before answering, so allow longer than a normal request. */
const INITIALIZE_TIMEOUT_MS = 60_000

export type ChatThreadEngineOptions = {
  engine: ChatEngine
  /** Fields for the `initialize` control request (prompt suggestions, subagent summaries). */
  initialize: Record<string, unknown>
}

export type ChatThreadEngineLink = {
  observe: (record: Record<string, unknown>) => void
  userMessage: (message: { id: string; text: string; imageCount: number; steer: boolean }) => void
  resolved: (requestId: string, behavior: 'allow' | 'deny') => void
  queueChanged: (queue: ChatThreadMessageQueueSnapshot) => void
  exited: (args: { stopping: boolean; error: string | null }) => void
}

export function linkChatThreadToEngine(
  options: ChatThreadEngineOptions,
  threadId: string,
  write: (payload: unknown) => boolean
): ChatThreadEngineLink {
  const { engine } = options
  const control = engine.attachProcess(threadId, write)
  let live = true
  // Must be the child's first stdin line, as the Agent SDK sends it.
  control.request('initialize', options.initialize, INITIALIZE_TIMEOUT_MS).then(
    (response) => {
      engine.setCapabilities(threadId, control, response)
      void engine.refreshAppliedSettings(threadId, control)
    },
    (error: unknown) => {
      if (live) {
        console.warn('[chat-engine] initialize failed:', error)
      }
    }
  )
  return {
    observe: (record) => {
      if (live) {
        engine.ingest(threadId, record)
      }
    },
    userMessage: (message) => {
      if (live) {
        engine.userMessage(threadId, message)
      }
    },
    resolved: (requestId, behavior) => {
      if (live) {
        engine.resolvePermission(threadId, requestId, behavior)
      }
    },
    queueChanged: (queue) => {
      if (live) {
        engine.setQueue(threadId, queue)
      }
    },
    exited: (args) => {
      if (live) {
        live = false
        engine.processExited(threadId, control, args)
      }
    }
  }
}
