// Decides the live streaming bubble's text for the resolved chat view, merging
// the two preview sources: stream-transport deltas (token-by-token stdout) and
// the hook preview (whole-message snapshots). Deltas outrank the hook preview.

import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { deriveNativeChatStreamingText } from '../../../../shared/native-chat-streaming'

export function useNativeChatStreamingBubble(args: {
  messages: readonly NativeChatMessage[]
  pendingMessages: readonly NativeChatMessage[]
  hookPreview: string | null | undefined
  liveWorking: boolean
  /** True when a stream transport owns this pane — its deltas are then the only
   *  preview source. Falling back to hook snapshots between messages makes the
   *  bubble content jump (and can surface raw tool payloads). */
  hasTransport: boolean
  transportStreamingText: string | null
}): string | null {
  const {
    messages,
    pendingMessages,
    hookPreview,
    liveWorking,
    hasTransport,
    transportStreamingText
  } = args
  return useMemo(() => {
    return deriveNativeChatStreamingText({
      messages: pendingMessages.length > 0 ? [...messages, ...pendingMessages] : messages,
      previewText: hasTransport ? transportStreamingText : hookPreview,
      working: liveWorking || transportStreamingText !== null
    })
  }, [messages, pendingMessages, hookPreview, liveWorking, hasTransport, transportStreamingText])
}
