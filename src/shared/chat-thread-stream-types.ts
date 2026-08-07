// Renderer-facing events for chat-mode's headless stream-json transport. Main
// parses the Claude CLI's NDJSON stdout and forwards only these compact events;
// the transcript file stays the authoritative message source.

export type ChatThreadStreamEvent =
  | { threadId: string; kind: 'init'; sessionId: string }
  | { threadId: string; kind: 'delta'; text: string }
  | { threadId: string; kind: 'message-final' }
  | { threadId: string; kind: 'turn-complete'; isError: boolean; errorMessage?: string }
  | {
      threadId: string
      kind: 'permission-request'
      requestId: string
      toolName: string
      input: unknown
    }
  /** The CLI voided a pending can_use_tool request (turn interrupted). */
  | { threadId: string; kind: 'permission-cancel'; requestId: string }
  | { threadId: string; kind: 'exit'; code: number | null; error?: string }

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
}

export type ChatThreadStreamStartResult = { ok: boolean; error?: string }

export const CHAT_THREAD_STREAM_EVENT_CHANNEL = 'chatThreadStream:event'
