// The live streaming bubble's text for the resolved chat view, from the hook
// preview (whole-message snapshots).

import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { deriveNativeChatStreamingText } from '../../../../shared/native-chat-streaming'

export function useNativeChatStreamingBubble(args: {
  messages: readonly NativeChatMessage[]
  pendingMessages: readonly NativeChatMessage[]
  hookPreview: string | null | undefined
  liveWorking: boolean
}): string | null {
  const { messages, pendingMessages, hookPreview, liveWorking } = args
  return useMemo(() => {
    return deriveNativeChatStreamingText({
      messages: pendingMessages.length > 0 ? [...messages, ...pendingMessages] : messages,
      previewText: hookPreview,
      working: liveWorking
    })
  }, [messages, pendingMessages, hookPreview, liveWorking])
}
