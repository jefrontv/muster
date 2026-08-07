// Delta coalescing for the chat stream: provider token chunks can arrive in
// dense bursts, and forwarding each as its own IPC event makes the renderer
// commit per token — visually chunky and wasteful. Merge deltas into ~50ms
// frames; every non-delta event flushes first so ordering is preserved.

import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'

export const DELTA_COALESCE_MS = 50

export type ChatThreadStreamEmitter = {
  emit: (event: ChatThreadStreamEvent) => void
  /** Flush any pending delta and cancel the timer (process close). */
  dispose: () => void
}

export function createCoalescingStreamEmitter(
  threadId: string,
  send: (event: ChatThreadStreamEvent) => void,
  intervalMs: number = DELTA_COALESCE_MS
): ChatThreadStreamEmitter {
  let pendingText = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pendingText !== '') {
      const text = pendingText
      pendingText = ''
      send({ threadId, kind: 'delta', text })
    }
  }

  return {
    emit: (event) => {
      if (event.kind === 'delta') {
        pendingText += event.text
        if (timer === null) {
          timer = setTimeout(flush, intervalMs)
          timer.unref?.()
        }
        return
      }
      flush()
      send(event)
    },
    dispose: flush
  }
}
