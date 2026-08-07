// NDJSON decoding for the Claude CLI's stream-json stdout. Line-buffered so
// partial chunks and non-JSON noise (login banners, warnings) never break the
// stream; each record maps to at most one compact renderer event.

import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'

type StreamRecord = Record<string, unknown>

function asRecord(value: unknown): StreamRecord | null {
  return typeof value === 'object' && value !== null ? (value as StreamRecord) : null
}

/** Map one parsed stream-json record to a renderer event, or null to drop it. */
export function mapChatThreadStreamRecord(
  threadId: string,
  record: StreamRecord
): ChatThreadStreamEvent | null {
  // Subagent output carries parent_tool_use_id; only top-level turns render.
  const fromSubagent =
    typeof record.parent_tool_use_id === 'string' && record.parent_tool_use_id !== ''
  switch (record.type) {
    case 'system': {
      if (record.subtype !== 'init' || typeof record.session_id !== 'string') {
        return null
      }
      return { threadId, kind: 'init', sessionId: record.session_id }
    }
    case 'stream_event': {
      if (fromSubagent) {
        return null
      }
      const event = asRecord(record.event)
      if (event?.type !== 'content_block_delta') {
        return null
      }
      const delta = asRecord(event.delta)
      if (delta?.type !== 'text_delta' || typeof delta.text !== 'string') {
        return null
      }
      return { threadId, kind: 'delta', text: delta.text }
    }
    case 'assistant': {
      return fromSubagent ? null : { threadId, kind: 'message-final' }
    }
    // Tool-permission control protocol (--permission-prompt-tool stdio): the CLI
    // asks before running an un-allowlisted tool instead of silently denying.
    case 'control_request': {
      const request = asRecord(record.request)
      if (
        request?.subtype !== 'can_use_tool' ||
        typeof record.request_id !== 'string' ||
        typeof request.tool_name !== 'string'
      ) {
        return null
      }
      return {
        threadId,
        kind: 'permission-request',
        requestId: record.request_id,
        toolName: request.tool_name,
        input: request.input
      }
    }
    case 'control_cancel_request': {
      if (typeof record.request_id !== 'string') {
        return null
      }
      return { threadId, kind: 'permission-cancel', requestId: record.request_id }
    }
    case 'result': {
      const isError = record.subtype !== 'success'
      const errorMessage =
        isError && typeof record.result === 'string' && record.result !== ''
          ? record.result
          : isError && typeof record.subtype === 'string'
            ? record.subtype
            : undefined
      return {
        threadId,
        kind: 'turn-complete',
        isError,
        ...(errorMessage ? { errorMessage } : {})
      }
    }
    default:
      return null
  }
}

export type ChatThreadStreamDecoder = {
  push: (chunk: string) => void
  /** Drain a trailing unterminated line (process exit). */
  flush: () => void
}

export function createChatThreadStreamDecoder(
  threadId: string,
  emit: (event: ChatThreadStreamEvent) => void
): ChatThreadStreamDecoder {
  let buffered = ''

  const consumeLine = (line: string): void => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return
    }
    const record = asRecord(parsed)
    if (!record) {
      return
    }
    const event = mapChatThreadStreamRecord(threadId, record)
    if (event) {
      emit(event)
    }
  }

  return {
    push: (chunk) => {
      buffered += chunk
      let newlineIndex = buffered.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex)
        buffered = buffered.slice(newlineIndex + 1)
        consumeLine(line)
        newlineIndex = buffered.indexOf('\n')
      }
    },
    flush: () => {
      if (buffered !== '') {
        const line = buffered
        buffered = ''
        consumeLine(line)
      }
    }
  }
}
