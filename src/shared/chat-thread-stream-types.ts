// Renderer-facing events for chat-mode's headless stream-json transport. Main
// parses the Claude CLI's NDJSON stdout and forwards only these compact events;
// the transcript file stays the authoritative message source.

export type ChatThreadStreamEvent =
  | { threadId: string; kind: 'init'; sessionId: string; model?: string }
  | { threadId: string; kind: 'delta'; text: string }
  | { threadId: string; kind: 'message-final' }
  | {
      threadId: string
      kind: 'turn-complete'
      isError: boolean
      errorMessage?: string
      /** The model's context window from the CLI's result record (modelUsage). */
      contextWindow?: number
    }
  | {
      threadId: string
      kind: 'permission-request'
      requestId: string
      toolName: string
      input: unknown
    }
  /** The CLI voided a pending can_use_tool request (turn interrupted). */
  | { threadId: string; kind: 'permission-cancel'; requestId: string }
  /** Attachments dropped from a send (unsupported type, over the size cap, unreadable). */
  | { threadId: string; kind: 'attachments-skipped'; paths: string[] }
  | { threadId: string; kind: 'exit'; code: number | null; error?: string }
  /** Messages held or in flight while the agent works; the full queue each time. */
  | { threadId: string; kind: 'queue-changed'; queue: ChatThreadMessageQueueSnapshot }

/** queued: held by Muster until the turn ends. sending/steering: written to the
 *  CLI, waiting for it to hand the message to the model. */
export type ChatThreadQueuedMessageState = 'queued' | 'sending' | 'steering'

export type ChatThreadQueuedMessage = {
  /** Also the CLI message uuid, which the CLI echoes back on delivery. */
  id: string
  text: string
  imagePaths?: string[]
  queuedAt: number
  state: ChatThreadQueuedMessageState
}

export type ChatThreadMessageQueueSnapshot = {
  items: ChatThreadQueuedMessage[]
  /** Set after a Stop: held messages wait for an explicit send instead of draining. */
  paused: boolean
}

/** sent: written as a normal turn. queued: held until the turn ends.
 *  steered: written mid-turn for the model's next step. */
export type ChatThreadSendOutcome = 'sent' | 'queued' | 'steered' | 'failed'

export type ChatThreadSendMode = 'auto' | 'steer'

export type ChatThreadPermissionResponseArgs = {
  threadId: string
  requestId: string
  behavior: 'allow' | 'deny'
  /** Deny reason shown to the model as the tool_result error. */
  message?: string
  /** Allow-time input override; defaults to the request's original input. */
  updatedInput?: unknown
}

export type ChatThreadStreamStartArgs = {
  threadId: string
  /** Full shell command line (agent binary + flags), built by the renderer. */
  command: string
  cwd?: string
  env?: Record<string, string>
  /** Written to a temp file and passed as --append-system-prompt-file. */
  appendSystemPrompt?: string
}

export type ChatThreadStreamStartResult = {
  ok: boolean
  error?: string
  /** The workspace folder is gone; the thread offers to locate or remove it. */
  reason?: 'folder-missing'
}

export const CHAT_THREAD_STREAM_EVENT_CHANNEL = 'chatThreadStream:event'
