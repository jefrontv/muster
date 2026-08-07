// Shared derivation for the in-flight "streaming" assistant bubble. While an
// agent works, its hook preview (lastAssistantMessage) is shown as a synthetic
// assistant message so the user sees the reply build in real time, before the
// completed turn is flushed to the transcript. Desktop and mobile both use this
// so the show/hide rule can't drift between platforms.

import type { NativeChatMessage } from './native-chat-types'

/** The synthetic streaming bubble's stable id (kept stable so the list keys it
 *  consistently across ticks and the real turn can replace it cleanly). */
export const NATIVE_CHAT_STREAMING_ID = 'streaming'

/** Concatenated text of an assistant message's text blocks, trimmed. */
function assistantText(message: NativeChatMessage | undefined): string {
  if (!message || message.role !== 'assistant') {
    return ''
  }
  return message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/** Text of the most recent assistant turn, scanning past trailing non-assistant
 *  rows (tool results, optimistic user echoes) that land between turns. */
function lastAssistantTextInTail(messages: readonly NativeChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = assistantText(messages[index])
    if (text) {
      return text
    }
  }
  return ''
}

/**
 * Decide the streaming text to show, or null to show nothing. Returns the
 * preview only while it leads the transcript — i.e. it's longer than (and not
 * already contained in) the last assistant turn. Once the real turn lands with
 * the same (or more) text, the preview is suppressed so the bubble doesn't
 * duplicate or flicker as the transcript catches up.
 *
 * `working` gates it: a stale preview from a finished turn never shows.
 */
export function deriveNativeChatStreamingText(args: {
  messages: readonly NativeChatMessage[]
  previewText: string | null | undefined
  working: boolean
}): string | null {
  const { messages, previewText, working } = args
  if (!working) {
    return null
  }
  const text = previewText?.trim()
  if (!text) {
    return null
  }
  // Containment checks the last assistant turn even past trailing tool-result
  // rows (a sealed preview must hide once its message lands). The length check
  // only applies when that turn is still the tail — a fresh message's first
  // short tokens must not be gated on outgrowing the previous reply.
  if (lastAssistantTextInTail(messages).includes(text)) {
    return null
  }
  if (text.length <= assistantText(messages.at(-1)).length) {
    return null
  }
  return text
}

/** Build the synthetic streaming assistant message for the given text. */
export function nativeChatStreamingMessage(text: string): NativeChatMessage {
  return {
    id: NATIVE_CHAT_STREAMING_ID,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'hook'
  }
}
