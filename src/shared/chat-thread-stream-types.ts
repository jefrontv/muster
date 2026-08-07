// Renderer-facing events for chat-mode's headless stream-json transport. Main
// parses the Claude CLI's NDJSON stdout and forwards only these compact events;
// the transcript file stays the authoritative message source.

export type ChatThreadStreamEvent =
  | { threadId: string; kind: 'init'; sessionId: string }
  | { threadId: string; kind: 'delta'; text: string }
  | { threadId: string; kind: 'message-final' }
  | { threadId: string; kind: 'turn-complete'; isError: boolean; errorMessage?: string }
  | { threadId: string; kind: 'exit'; code: number | null; error?: string }

export type ChatThreadStreamStartArgs = {
  threadId: string
  /** Full shell command line (agent binary + flags), built by the renderer. */
  command: string
  cwd?: string
  env?: Record<string, string>
}

export type ChatThreadStreamStartResult = { ok: boolean; error?: string }

export const CHAT_THREAD_STREAM_EVENT_CHANNEL = 'chatThreadStream:event'
