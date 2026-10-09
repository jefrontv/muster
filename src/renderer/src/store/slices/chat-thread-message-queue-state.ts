// Mirror of main's per-thread message queue (messages sent while the agent
// works). Main owns the queue; this slice only holds its latest snapshot.
// Composed into ChatModeSlice; runtime-only.

import type { StateCreator } from 'zustand'
import type { ChatThreadMessageQueueSnapshot } from '../../../../shared/chat-thread-stream-types'
import type { AppState } from '../types'

export type ChatThreadMessageQueueSlice = {
  chatThreadMessageQueues: Record<string, ChatThreadMessageQueueSnapshot>
  setChatThreadMessageQueue: (
    threadId: string,
    queue: ChatThreadMessageQueueSnapshot | null
  ) => void
}

export const createChatThreadMessageQueueSlice: StateCreator<
  AppState,
  [],
  [],
  ChatThreadMessageQueueSlice
> = (set) => ({
  chatThreadMessageQueues: {},

  setChatThreadMessageQueue: (threadId, queue) =>
    set((s) => {
      if (queue === null || (queue.items.length === 0 && !queue.paused)) {
        if (!(threadId in s.chatThreadMessageQueues)) {
          return s
        }
        const { [threadId]: _dropped, ...remaining } = s.chatThreadMessageQueues
        return { chatThreadMessageQueues: remaining }
      }
      return { chatThreadMessageQueues: { ...s.chatThreadMessageQueues, [threadId]: queue } }
    })
})
