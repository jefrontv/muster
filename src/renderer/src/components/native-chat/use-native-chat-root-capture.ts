// Root-level capture handlers for the chat pane: right-click selection capture,
// focus-on-click, and typing redirection into the composer.

import { useCallback, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import {
  shouldFocusNativeChatComposerFromEditingKey,
  shouldFocusNativeChatPaneFromPointerTarget,
  shouldRedirectNativeChatTyping
} from './native-chat-typing-redirect'

export function useNativeChatRootCapture({
  rootRef,
  composerRef,
  onSelectionCapture
}: {
  rootRef: RefObject<HTMLDivElement | null>
  composerRef: RefObject<NativeChatComposerHandle | null>
  onSelectionCapture: () => void
}): {
  onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void
  onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => void
} {
  const onPointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button === 2) {
        onSelectionCapture()
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (event.button === 0 && shouldFocusNativeChatPaneFromPointerTarget(event.target)) {
        rootRef.current?.focus({ preventScroll: true })
      }
    },
    [onSelectionCapture, rootRef]
  )

  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Backspace/Delete outside an input focuses the composer (like typing)
      // but inserts nothing — let the now-focused field handle the keystroke.
      if (shouldFocusNativeChatComposerFromEditingKey(event)) {
        composerRef.current?.focus()
        return
      }
      if (!shouldRedirectNativeChatTyping(event)) {
        return
      }
      if (!composerRef.current?.insertTypedText(event.key)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [composerRef]
  )

  return { onPointerDownCapture, onKeyDownCapture }
}
