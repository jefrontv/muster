// Per-thread message queue for a busy chat stream. Messages sent mid-turn are
// held here (not written to the CLI) so the user can steer, edit or drop them;
// the head drains as its own turn once the current one ends.

import { randomUUID } from 'node:crypto'
import type {
  ChatThreadMessageQueueSnapshot,
  ChatThreadQueuedMessage,
  ChatThreadSendMode,
  ChatThreadSendOutcome
} from '../../shared/chat-thread-stream-types'

/** CLI delivery priority: 'next' lands at the model's next step without ending the turn. */
export type ChatThreadQueueWritePriority = 'next'

export type ChatThreadQueueWrite = (
  message: { id: string; text: string; imagePaths?: string[] },
  priority?: ChatThreadQueueWritePriority
) => Promise<boolean>

export type ChatThreadMessageQueue = {
  submit: (args: {
    text: string
    imagePaths?: string[]
    mode: ChatThreadSendMode
  }) => Promise<ChatThreadSendOutcome>
  steer: (id: string) => Promise<boolean>
  remove: (id: string) => boolean
  sendNext: () => Promise<boolean>
  noteInterruptRequested: () => void
  /** The CLI replayed a user message (--replay-user-messages): it reached the model. */
  noteDelivered: (id: string) => void
  noteTurnComplete: () => void
  snapshot: () => ChatThreadMessageQueueSnapshot
}

export function createChatThreadMessageQueue(args: {
  write: ChatThreadQueueWrite
  onChange: (snapshot: ChatThreadMessageQueueSnapshot) => void
  now?: () => number
  newId?: () => string
}): ChatThreadMessageQueue {
  const now = args.now ?? Date.now
  const newId = args.newId ?? randomUUID
  let items: ChatThreadQueuedMessage[] = []
  let busy = false
  let paused = false
  let interruptRequested = false
  // An older CLI without replay never confirms delivery; fall back to turn ends.
  let replaySeen = false

  const snapshot = (): ChatThreadMessageQueueSnapshot => ({
    items: items.map((item) => ({ ...item })),
    paused
  })
  const changed = (): void => args.onChange(snapshot())

  const writeItem = async (
    item: ChatThreadQueuedMessage,
    priority?: ChatThreadQueueWritePriority
  ): Promise<boolean> => {
    const ok = await args.write(
      { id: item.id, text: item.text, ...(item.imagePaths ? { imagePaths: item.imagePaths } : {}) },
      priority
    )
    if (!ok) {
      items = items.filter((entry) => entry.id !== item.id)
      changed()
    }
    return ok
  }

  // Idle: the item becomes the next turn. Busy: it rides the current turn.
  const dispatch = async (item: ChatThreadQueuedMessage): Promise<boolean> => {
    if (busy) {
      item.state = 'steering'
      changed()
      return writeItem(item, 'next')
    }
    busy = true
    item.state = 'sending'
    changed()
    const ok = await writeItem(item)
    if (!ok) {
      busy = false
    }
    return ok
  }

  const drain = async (): Promise<void> => {
    if (busy || paused) {
      return
    }
    const head = items.find((item) => item.state === 'queued')
    if (head) {
      await dispatch(head)
    }
  }

  return {
    submit: async ({ text, imagePaths, mode }) => {
      const id = newId()
      const message = { id, text, ...(imagePaths?.length ? { imagePaths } : {}) }
      if (!busy) {
        busy = true
        const ok = await args.write(message)
        if (!ok) {
          busy = false
        }
        return ok ? 'sent' : 'failed'
      }
      const item: ChatThreadQueuedMessage = { ...message, queuedAt: now(), state: 'queued' }
      items = [...items, item]
      if (mode === 'steer') {
        return (await dispatch(item)) ? 'steered' : 'failed'
      }
      changed()
      return 'queued'
    },
    steer: async (id) => {
      const item = items.find((entry) => entry.id === id && entry.state === 'queued')
      return item ? dispatch(item) : false
    },
    remove: (id) => {
      const before = items.length
      items = items.filter((entry) => !(entry.id === id && entry.state === 'queued'))
      if (items.length === before) {
        return false
      }
      if (!items.some((entry) => entry.state === 'queued')) {
        paused = false
      }
      changed()
      return true
    },
    sendNext: async () => {
      paused = false
      changed()
      const head = items.find((item) => item.state === 'queued')
      if (!head) {
        return false
      }
      if (busy) {
        return true
      }
      return dispatch(head)
    },
    noteInterruptRequested: () => {
      interruptRequested = true
    },
    noteDelivered: (id) => {
      replaySeen = true
      const before = items.length
      items = items.filter((entry) => !(entry.id === id && entry.state !== 'queued'))
      if (items.length !== before) {
        changed()
      }
    },
    noteTurnComplete: () => {
      if (interruptRequested) {
        interruptRequested = false
        paused = items.some((entry) => entry.state === 'queued')
      }
      const inFlight = items.some((entry) => entry.state !== 'queued')
      // The CLI runs a written-but-undelivered message as its next turn, even after an interrupt.
      if (inFlight && replaySeen) {
        changed()
        return
      }
      if (inFlight) {
        items = items.filter((entry) => entry.state === 'queued')
      }
      busy = false
      changed()
      void drain()
    },
    snapshot
  }
}
