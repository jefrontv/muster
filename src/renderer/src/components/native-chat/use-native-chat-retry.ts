// Retry under a reply (or a failed turn): resend the prompt that produced it,
// echoed like any composer send. Stream threads only; a PTY pane has no
// reliable way to resend without retyping into the terminal.

import { useMemo, useRef } from 'react'
import { isTextBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatTransport } from './native-chat-view-types'

/** The prompt a reply answered: the last real user turn before it (or before the end). */
export function retryPromptText(
  messages: readonly NativeChatMessage[],
  replyMessageId: string | null
): string | null {
  const end = replyMessageId ? messages.findIndex((m) => m.id === replyMessageId) : -1
  const prompt = messages
    .slice(0, end === -1 ? messages.length : end)
    .findLast((message) => message.role === 'user' && message.source !== 'scrape')
  const text = prompt?.blocks
    .map((block) => (isTextBlock(block) ? block.text : ''))
    .join('')
    .trim()
  return text ? text : null
}

export function useNativeChatRetry(input: {
  messages: readonly NativeChatMessage[]
  transport: NativeChatTransport | null
  onOptimisticSend: (text: string) => string | undefined
  onOptimisticSendCanceled: (pendingId: string) => void
}): ((replyMessageId: string | null) => void) | undefined {
  // Refs, so the callback keeps one identity across streaming ticks and memoized rows skip work.
  const latest = useRef(input)
  latest.current = input
  const hasTransport = input.transport !== null
  return useMemo(() => {
    if (!hasTransport) {
      return undefined
    }
    return (replyMessageId: string | null) => {
      const { messages, transport, onOptimisticSend, onOptimisticSendCanceled } = latest.current
      const text = retryPromptText(messages, replyMessageId)
      if (!text || !transport) {
        return
      }
      const pendingId = onOptimisticSend(text)
      void transport.send(text).then((delivered) => {
        if (!delivered && pendingId) {
          onOptimisticSendCanceled(pendingId)
        }
      })
    }
  }, [hasTransport])
}
