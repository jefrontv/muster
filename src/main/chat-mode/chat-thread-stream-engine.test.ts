import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatEngine } from './engine/chat-engine'
import {
  respondChatThreadPermission,
  sendChatThreadStreamMessage,
  startChatThreadStream,
  stopAllChatThreadStreams,
  stopChatThreadStream
} from './chat-thread-stream'

type FakeChild = ChildProcess & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough }

function fakeChild(): FakeChild & { lines: () => Record<string, unknown>[] } {
  const child = new EventEmitter() as FakeChild & { lines: () => Record<string, unknown>[] }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn().mockReturnValue(true) as unknown as FakeChild['kill']
  let written = ''
  child.stdin.on('data', (chunk: Buffer) => (written += chunk.toString()))
  child.lines = () =>
    written
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  return child
}

const sender = { send: () => undefined, isDestroyed: () => false }
const out = (child: FakeChild, record: Record<string, unknown>): void => {
  child.stdout.write(`${JSON.stringify(record)}\n`)
}

function start(engine: ChatEngine, child: FakeChild, env?: Record<string, string>) {
  const spawn = vi.fn(
    (_command: string, _args: string[], _options: { env: NodeJS.ProcessEnv }) => child
  )
  startChatThreadStream(
    { threadId: 't1', command: 'claude -p', sender, ...(env ? { env } : {}) },
    {
      spawn,
      hookEnv: () => ({}),
      loginShellEnv: () => ({}),
      engine: { engine, initialize: { promptSuggestions: true } }
    }
  )
  return spawn
}

describe('chat thread stream with the engine attached', () => {
  afterEach(() => stopAllChatThreadStreams())

  it('opens with initialize, records turns, and keeps the capabilities it reports', async () => {
    const engine = new ChatEngine()
    const child = fakeChild()
    const spawn = start(engine, child)
    expect(spawn.mock.calls[0]?.[2].env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING).toBe('true')
    await vi.waitFor(() =>
      expect(child.lines()[0]).toEqual({
        type: 'control_request',
        request_id: 'muster_1',
        request: { subtype: 'initialize', promptSuggestions: true }
      })
    )
    out(child, {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'muster_1',
        response: { commands: [{ name: 'review', description: 'Review a PR' }], models: [] }
      }
    })
    await vi.waitFor(() =>
      expect(engine.capabilities('t1')?.commands).toEqual([
        { name: 'review', description: 'Review a PR', argumentHint: '' }
      ])
    )

    expect(await sendChatThreadStreamMessage('t1', 'Fix the header')).toBe('sent')
    out(child, {
      type: 'control_request',
      request_id: 'perm-1',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } }
    })
    await vi.waitFor(() => expect(engine.snapshot('t1')?.meta.status).toBe('waiting'))
    respondChatThreadPermission({
      threadId: 't1',
      requestId: 'perm-1',
      behavior: 'allow',
      updatedPermissions: [{ type: 'addRules', destination: 'session' }]
    })
    expect(engine.snapshot('t1')?.meta.pending).toEqual([])
    await vi.waitFor(() =>
      expect(child.lines().at(-1)).toMatchObject({
        response: {
          request_id: 'perm-1',
          response: { behavior: 'allow', updatedPermissions: [{ type: 'addRules' }] }
        }
      })
    )
    expect(engine.snapshot('t1')?.turns.map((turn) => turn.user?.text)).toEqual(['Fix the header'])
  })

  it('holds a queued message until the running turn ends', async () => {
    const engine = new ChatEngine()
    const child = fakeChild()
    start(engine, child)
    out(child, { type: 'system', subtype: 'init', session_id: 's1' })
    expect(await sendChatThreadStreamMessage('t1', 'First')).toBe('sent')
    expect(await sendChatThreadStreamMessage('t1', 'Then this')).toBe('queued')
    const userLines = () => child.lines().filter((line) => line.type === 'user')
    expect(engine.snapshot('t1')?.meta.queue.items.map((item) => item.text)).toEqual(['Then this'])
    expect(userLines()).toHaveLength(1)

    out(child, { type: 'result', subtype: 'success', duration_ms: 5, total_cost_usd: 0 })
    await vi.waitFor(() => expect(userLines()).toHaveLength(2))
    expect(userLines()[1]).toMatchObject({
      message: { content: [{ type: 'text', text: 'Then this' }] }
    })
    await vi.waitFor(() =>
      expect(
        engine.snapshot('t1')?.meta.queue.items.filter((item) => item.state === 'queued')
      ).toEqual([])
    )
    expect(engine.snapshot('t1')?.turns.map((turn) => turn.user?.text)).toEqual([
      'First',
      'Then this'
    ])
  })

  it('marks the thread stopped on stop and ignores the replaced child closing late', () => {
    const engine = new ChatEngine()
    const first = fakeChild()
    start(engine, first)
    stopChatThreadStream('t1')
    expect(engine.snapshot('t1')?.meta.status).toBe('stopped')

    const second = fakeChild()
    start(engine, second)
    first.emit('close', null)
    expect(engine.snapshot('t1')?.meta.status).toBe('starting')

    second.stderr.write('auth expired')
    second.emit('close', 1)
    expect(engine.snapshot('t1')?.meta).toMatchObject({
      status: 'stopped',
      lastError: 'auth expired'
    })
  })
})
