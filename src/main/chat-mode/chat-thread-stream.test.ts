import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import {
  createChatThreadStreamDecoder,
  mapChatThreadStreamRecord
} from './chat-thread-stream-decode'
import {
  chatThreadStreamCountForTests,
  sendChatThreadStreamMessage,
  startChatThreadStream,
  stopAllChatThreadStreams,
  stopChatThreadStream
} from './chat-thread-stream'

function collectEvents(): {
  events: ChatThreadStreamEvent[]
  emit: (e: ChatThreadStreamEvent) => void
} {
  const events: ChatThreadStreamEvent[] = []
  return { events, emit: (e) => events.push(e) }
}

describe('mapChatThreadStreamRecord', () => {
  it('maps system init to an init event with the session id', () => {
    expect(
      mapChatThreadStreamRecord('t1', { type: 'system', subtype: 'init', session_id: 'abc' })
    ).toEqual({ threadId: 't1', kind: 'init', sessionId: 'abc' })
  })

  it('ignores system records without an init subtype or session id', () => {
    expect(mapChatThreadStreamRecord('t1', { type: 'system', subtype: 'other' })).toBeNull()
    expect(mapChatThreadStreamRecord('t1', { type: 'system', subtype: 'init' })).toBeNull()
  })

  it('maps top-level text deltas and skips non-text deltas', () => {
    expect(
      mapChatThreadStreamRecord('t1', {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }
      })
    ).toEqual({ threadId: 't1', kind: 'delta', text: 'hi' })
    expect(
      mapChatThreadStreamRecord('t1', {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: '{' }
        }
      })
    ).toBeNull()
  })

  it('skips subagent deltas and subagent assistant messages', () => {
    expect(
      mapChatThreadStreamRecord('t1', {
        type: 'stream_event',
        parent_tool_use_id: 'toolu_1',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'sub' } }
      })
    ).toBeNull()
    expect(
      mapChatThreadStreamRecord('t1', { type: 'assistant', parent_tool_use_id: 'toolu_1' })
    ).toBeNull()
  })

  it('maps a top-level assistant record to message-final', () => {
    expect(mapChatThreadStreamRecord('t1', { type: 'assistant', message: {} })).toEqual({
      threadId: 't1',
      kind: 'message-final'
    })
  })

  it('maps result records to turn-complete with error details', () => {
    expect(mapChatThreadStreamRecord('t1', { type: 'result', subtype: 'success' })).toEqual({
      threadId: 't1',
      kind: 'turn-complete',
      isError: false
    })
    expect(
      mapChatThreadStreamRecord('t1', {
        type: 'result',
        subtype: 'error_during_execution',
        result: 'boom'
      })
    ).toEqual({ threadId: 't1', kind: 'turn-complete', isError: true, errorMessage: 'boom' })
    expect(mapChatThreadStreamRecord('t1', { type: 'result', subtype: 'error_max_turns' })).toEqual(
      { threadId: 't1', kind: 'turn-complete', isError: true, errorMessage: 'error_max_turns' }
    )
  })

  it('ignores unknown record types', () => {
    expect(mapChatThreadStreamRecord('t1', { type: 'user' })).toBeNull()
  })
})

describe('createChatThreadStreamDecoder', () => {
  it('reassembles records across chunk boundaries', () => {
    const { events, emit } = collectEvents()
    const decoder = createChatThreadStreamDecoder('t1', emit)
    const line = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' })
    decoder.push(line.slice(0, 10))
    expect(events).toHaveLength(0)
    decoder.push(`${line.slice(10)}\n`)
    expect(events).toEqual([{ threadId: 't1', kind: 'init', sessionId: 's1' }])
  })

  it('tolerates garbage lines and interleaved noise', () => {
    const { events, emit } = collectEvents()
    const decoder = createChatThreadStreamDecoder('t1', emit)
    decoder.push('not json at all\n{broken json\n')
    decoder.push(`${JSON.stringify({ type: 'assistant' })}\n"just a string"\n`)
    expect(events).toEqual([{ threadId: 't1', kind: 'message-final' }])
  })

  it('flushes a trailing unterminated line', () => {
    const { events, emit } = collectEvents()
    const decoder = createChatThreadStreamDecoder('t1', emit)
    decoder.push(JSON.stringify({ type: 'result', subtype: 'success' }))
    expect(events).toHaveLength(0)
    decoder.flush()
    expect(events).toEqual([{ threadId: 't1', kind: 'turn-complete', isError: false }])
  })
})

type FakeChild = ChildProcess & {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn().mockReturnValue(true) as unknown as FakeChild['kill']
  return child
}

function createSender(): {
  sent: ChatThreadStreamEvent[]
  sender: {
    send: (channel: string, payload: ChatThreadStreamEvent) => void
    isDestroyed: () => boolean
  }
} {
  const sent: ChatThreadStreamEvent[] = []
  return {
    sent,
    sender: { send: (_channel, payload) => sent.push(payload), isDestroyed: () => false }
  }
}

describe('startChatThreadStream', () => {
  afterEach(() => {
    stopAllChatThreadStreams()
  })

  it('streams decoded stdout records to the sender and reports exit with stderr tail', () => {
    const child = createFakeChild()
    const { sent, sender } = createSender()
    const result = startChatThreadStream(
      { threadId: 't1', command: 'claude -p', sender },
      { spawn: () => child, hookEnv: () => ({}) }
    )
    expect(result.ok).toBe(true)
    child.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's9' })}\n`)
    child.stderr.write('fatal: something broke')
    child.emit('close', 1)
    expect(sent).toEqual([
      { threadId: 't1', kind: 'init', sessionId: 's9' },
      { threadId: 't1', kind: 'exit', code: 1, error: 'fatal: something broke' }
    ])
    expect(chatThreadStreamCountForTests()).toBe(0)
  })

  it('injects hook env and pane env over a cloned process.env', () => {
    const child = createFakeChild()
    const { sender } = createSender()
    let seenEnv: NodeJS.ProcessEnv = {}
    startChatThreadStream(
      { threadId: 't1', command: 'claude -p', env: { ORCA_PANE_KEY: 'tab:leaf' }, sender },
      {
        spawn: (_cmd, _args, options) => {
          seenEnv = options.env
          return child
        },
        hookEnv: () => ({ ORCA_AGENT_HOOK_PORT: '4242' })
      }
    )
    expect(seenEnv.ORCA_PANE_KEY).toBe('tab:leaf')
    expect(seenEnv.ORCA_AGENT_HOOK_PORT).toBe('4242')
    expect(seenEnv.PATH ?? seenEnv.Path).toBeDefined()
    child.emit('close', 0)
  })

  it('writes user turns as NDJSON to stdin and refuses missing threads', () => {
    const child = createFakeChild()
    const { sender } = createSender()
    startChatThreadStream(
      { threadId: 't1', command: 'claude -p', sender },
      { spawn: () => child, hookEnv: () => ({}) }
    )
    expect(sendChatThreadStreamMessage('t1', 'hello')).toBe(true)
    const written = child.stdin.read() as Buffer
    expect(JSON.parse(written.toString().trim())).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'hello' }] }
    })
    expect(sendChatThreadStreamMessage('missing', 'hello')).toBe(false)
    child.emit('close', 0)
  })

  it('suppresses the exit event for an intentional stop and is idempotent', () => {
    const child = createFakeChild()
    const { sent, sender } = createSender()
    startChatThreadStream(
      { threadId: 't1', command: 'claude -p', sender },
      { spawn: () => child, hookEnv: () => ({}) }
    )
    stopChatThreadStream('t1')
    stopChatThreadStream('t1')
    expect(sendChatThreadStreamMessage('t1', 'late')).toBe(false)
    child.emit('close', 0)
    expect(sent).toEqual([])
    expect(chatThreadStreamCountForTests()).toBe(0)
  })

  it('replaces an existing child when the same thread starts again', () => {
    const first = createFakeChild()
    const second = createFakeChild()
    const { sent, sender } = createSender()
    const children = [first, second]
    const deps = { spawn: () => children.shift() as FakeChild, hookEnv: () => ({}) }
    startChatThreadStream({ threadId: 't1', command: 'claude -p', sender }, deps)
    startChatThreadStream({ threadId: 't1', command: 'claude -p', sender }, deps)
    expect(chatThreadStreamCountForTests()).toBe(1)
    // The superseded child's exit must not surface as a thread exit.
    first.emit('close', 0)
    expect(sent).toEqual([])
    second.emit('close', 0)
  })
})
