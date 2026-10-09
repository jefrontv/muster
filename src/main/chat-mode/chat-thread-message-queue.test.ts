import { describe, expect, it } from 'vitest'
import type { ChatThreadMessageQueueSnapshot } from '../../shared/chat-thread-stream-types'
import {
  createChatThreadMessageQueue,
  type ChatThreadQueueWritePriority
} from './chat-thread-message-queue'

function setup(options: { failWrites?: boolean } = {}) {
  const writes: { id: string; text: string; priority?: ChatThreadQueueWritePriority }[] = []
  const snapshots: ChatThreadMessageQueueSnapshot[] = []
  let counter = 0
  const queue = createChatThreadMessageQueue({
    write: async (message, priority) => {
      writes.push({ id: message.id, text: message.text, ...(priority ? { priority } : {}) })
      return !options.failWrites
    },
    onChange: (snapshot) => snapshots.push(snapshot),
    now: () => 1000,
    newId: () => `m${++counter}`
  })
  const latest = (): ChatThreadMessageQueueSnapshot | undefined => snapshots.at(-1)
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
  return { queue, writes, latest, flush }
}

describe('chat thread message queue', () => {
  it('sends straight through when idle and holds messages while a turn runs', async () => {
    const { queue, writes, latest } = setup()
    await expect(queue.submit({ text: 'first', mode: 'auto' })).resolves.toBe('sent')
    await expect(queue.submit({ text: 'second', mode: 'auto' })).resolves.toBe('queued')
    expect(writes.map((w) => w.text)).toEqual(['first'])
    expect(latest()?.items.map((i) => [i.text, i.state])).toEqual([['second', 'queued']])
  })

  it('drains one held message per finished turn, in order', async () => {
    const { queue, writes, latest, flush } = setup()
    await queue.submit({ text: 'first', mode: 'auto' })
    await queue.submit({ text: 'second', mode: 'auto' })
    await queue.submit({ text: 'third', mode: 'auto' })

    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => [w.text, w.priority])).toEqual([
      ['first', undefined],
      ['second', undefined]
    ])
    expect(latest()?.items.map((i) => [i.text, i.state])).toEqual([
      ['second', 'sending'],
      ['third', 'queued']
    ])

    queue.noteDelivered('m2')
    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => w.text)).toEqual(['first', 'second', 'third'])
  })

  it('steers with next priority and drops the message once the CLI delivers it', async () => {
    const { queue, writes, latest } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    await expect(queue.submit({ text: 'use tabs', mode: 'steer' })).resolves.toBe('steered')
    expect(writes.at(-1)).toEqual({ id: 'm2', text: 'use tabs', priority: 'next' })
    expect(latest()?.items.map((i) => i.state)).toEqual(['steering'])

    queue.noteDelivered('m2')
    expect(latest()?.items).toEqual([])
  })

  it('steers a held message on request', async () => {
    const { queue, writes } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    await queue.submit({ text: 'later', mode: 'auto' })
    await expect(queue.steer('m2')).resolves.toBe(true)
    expect(writes.at(-1)).toEqual({ id: 'm2', text: 'later', priority: 'next' })
    await expect(queue.steer('m2')).resolves.toBe(false)
  })

  it('waits for an undelivered steer to run as its own turn before draining', async () => {
    const { queue, writes, flush } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    queue.noteDelivered('m1')
    await queue.submit({ text: 'steer', mode: 'steer' })
    await queue.submit({ text: 'held', mode: 'auto' })

    // The turn ended before the model reached a step; the CLI runs the steer next.
    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => w.text)).toEqual(['work', 'steer'])

    queue.noteDelivered('m2')
    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => w.text)).toEqual(['work', 'steer', 'held'])
  })

  it('pauses held messages after a Stop until the user sends the next one', async () => {
    const { queue, writes, latest, flush } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    await queue.submit({ text: 'held', mode: 'auto' })
    queue.noteInterruptRequested()
    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => w.text)).toEqual(['work'])
    expect(latest()?.paused).toBe(true)

    await expect(queue.sendNext()).resolves.toBe(true)
    expect(writes.map((w) => w.text)).toEqual(['work', 'held'])
    expect(latest()?.paused).toBe(false)
  })

  it('removes only held messages and clears the pause when the queue empties', async () => {
    const { queue, latest } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    queue.noteDelivered('m1')
    await queue.submit({ text: 'held', mode: 'auto' })
    await queue.submit({ text: 'steer', mode: 'steer' })
    queue.noteInterruptRequested()
    queue.noteTurnComplete()

    expect(queue.remove('m3')).toBe(false)
    expect(queue.remove('m2')).toBe(true)
    expect(latest()?.items.map((i) => i.text)).toEqual(['steer'])
    expect(latest()?.paused).toBe(false)
  })

  it('without delivery echoes, clears in-flight messages at the turn end', async () => {
    const { queue, writes, latest, flush } = setup()
    await queue.submit({ text: 'work', mode: 'auto' })
    await queue.submit({ text: 'steer', mode: 'steer' })
    await queue.submit({ text: 'held', mode: 'auto' })
    queue.noteTurnComplete()
    await flush()
    expect(writes.map((w) => w.text)).toEqual(['work', 'steer', 'held'])
    expect(latest()?.items.map((i) => [i.text, i.state])).toEqual([['held', 'sending']])
  })

  it('drops a message whose write fails and reports the failure', async () => {
    const { queue, latest } = setup({ failWrites: true })
    await expect(queue.submit({ text: 'work', mode: 'auto' })).resolves.toBe('failed')
    // A failed idle send leaves the thread idle, so the next send goes straight through.
    await expect(queue.submit({ text: 'again', mode: 'auto' })).resolves.toBe('failed')
    expect(latest()).toBeUndefined()
  })
})
