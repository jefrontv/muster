// The queue wired to a real stream entry: stdin payloads, delivery echoes from
// stdout, and queue-changed events reaching the renderer.
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import {
  interruptChatThreadStream,
  listChatThreadMessageQueues,
  sendChatThreadStreamMessage,
  sendNextChatThreadQueuedMessage,
  startChatThreadStream,
  stopAllChatThreadStreams
} from './chat-thread-stream'

type FakeChild = ChildProcess & { stdout: PassThrough; stdin: PassThrough; stderr: PassThrough }

function start(): { child: FakeChild; sent: ChatThreadStreamEvent[] } {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn().mockReturnValue(true) as unknown as FakeChild['kill']
  const sent: ChatThreadStreamEvent[] = []
  startChatThreadStream(
    {
      threadId: 't1',
      command: 'claude -p',
      sender: { send: (_channel, event) => sent.push(event), isDestroyed: () => false }
    },
    { spawn: () => child, hookEnv: () => ({}) }
  )
  return { child, sent }
}

function readWrites(child: FakeChild): Record<string, unknown>[] {
  const chunk = child.stdin.read() as Buffer | null
  return chunk
    ? chunk
        .toString()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : []
}

function stdout(child: FakeChild, record: Record<string, unknown>): Promise<void> {
  child.stdout.write(`${JSON.stringify(record)}\n`)
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const lastQueue = (sent: ChatThreadStreamEvent[]) =>
  sent.findLast((event) => event.kind === 'queue-changed')

describe('chat thread stream queue', () => {
  afterEach(() => stopAllChatThreadStreams())

  it('holds a mid-turn send and writes it when the turn ends', async () => {
    const { child, sent } = start()
    await sendChatThreadStreamMessage('t1', 'first')
    const [first] = readWrites(child)
    await stdout(child, { type: 'user', isReplay: true, uuid: first!.uuid })

    await expect(sendChatThreadStreamMessage('t1', 'second')).resolves.toBe('queued')
    expect(readWrites(child)).toEqual([])
    expect(listChatThreadMessageQueues()[0]?.queue.items.map((item) => item.text)).toEqual([
      'second'
    ])

    await stdout(child, { type: 'result', subtype: 'success' })
    const [second] = readWrites(child)
    expect(second?.message).toEqual({ role: 'user', content: [{ type: 'text', text: 'second' }] })
    expect(second?.priority).toBeUndefined()

    await stdout(child, { type: 'user', isReplay: true, uuid: second!.uuid })
    expect(lastQueue(sent)).toMatchObject({ queue: { items: [], paused: false } })
    child.emit('close', 0)
  })

  it('steers mid-turn with next priority', async () => {
    const { child } = start()
    await sendChatThreadStreamMessage('t1', 'work')
    readWrites(child)
    await expect(sendChatThreadStreamMessage('t1', 'use tabs', undefined, 'steer')).resolves.toBe(
      'steered'
    )
    expect(readWrites(child)[0]).toMatchObject({ priority: 'next', parent_tool_use_id: null })
    child.emit('close', 0)
  })

  it('pauses held messages after an interrupt until sendNext', async () => {
    const { child, sent } = start()
    await sendChatThreadStreamMessage('t1', 'work')
    await sendChatThreadStreamMessage('t1', 'held')
    readWrites(child)
    interruptChatThreadStream('t1')
    readWrites(child)
    await stdout(child, { type: 'result', subtype: 'error_during_execution' })
    expect(readWrites(child)).toEqual([])
    expect(lastQueue(sent)).toMatchObject({ queue: { paused: true } })

    await expect(sendNextChatThreadQueuedMessage('t1')).resolves.toBe(true)
    expect(readWrites(child)[0]?.message).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'held' }]
    })
    child.emit('close', 0)
  })
})
