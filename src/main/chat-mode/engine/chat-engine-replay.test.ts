// Replays a recorded Claude Code session (CLI 2.1.303, stream-json with partials)
// through the engine. However the records arrive, and whenever a window joins,
// every path has to land on the same thread model.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEnginePatch, ChatEngineSnapshot } from '../../../shared/chat-engine-types'
import { applyChatEnginePatch } from '../../../shared/chat-engine-patch'
import { createChatThreadStreamDecoder } from '../chat-thread-stream-decode'
import { ChatEngine } from './chat-engine'
import type { Rec } from './chat-engine-records'

const FIXTURE = resolve('src/main/chat-mode/engine/__fixtures__/claude-2.1.303-read-edit.ndjson')
const RAW = readFileSync(FIXTURE, 'utf-8')
const RECORDS: Rec[] = RAW.split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Rec)
const PROMPT = 'Read style.css, then change 100vh to 100dvh in it. Reply with one short sentence.'

type Step = { user: true } | { record: Rec }

/** The user message goes in where the stream layer would report it: just before its echo. */
function steps(records: Rec[]): Step[] {
  const echo = records.findIndex((record) => record.type === 'user')
  return [
    ...records.slice(0, echo).map((record) => ({ record })),
    { user: true as const },
    ...records.slice(echo).map((record) => ({ record }))
  ]
}

function play(engine: ChatEngine, step: Step): void {
  if ('user' in step) {
    engine.userMessage('t', { id: 'rec-user-1', text: PROMPT, imageCount: 0, steer: false })
  } else {
    engine.ingest('t', step.record)
  }
}

function model(snapshot: ChatEngineSnapshot | null): Omit<ChatEngineSnapshot, 'version'> {
  expect(snapshot).not.toBeNull()
  return { meta: snapshot!.meta, turns: snapshot!.turns }
}

function replayAll(records: Rec[]): ChatEngineSnapshot | null {
  const engine = new ChatEngine({ now: () => 1_000 })
  for (const step of steps(records)) {
    play(engine, step)
  }
  return engine.snapshot('t')
}

describe('chat engine replay of a recorded session', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a streaming Edit its path before the block closes', () => {
    const engine = new ChatEngine({ now: () => 1_000 })
    const seen: unknown[] = []
    for (const step of steps(RECORDS)) {
      play(engine, step)
      const edit = engine
        .snapshot('t')
        ?.turns.at(-1)
        ?.items.find((item) => item.kind === 'tool' && item.name === 'Edit')
      if (edit?.kind === 'tool' && edit.status === 'streaming') {
        seen.push(edit.input)
      }
    }
    expect(seen.some((input) => (input as { file_path?: string })?.file_path)).toBe(true)
  })

  it('folds partials into one settled turn: read, edit, reply', () => {
    const snapshot = replayAll(RECORDS)!
    expect(snapshot.meta.status).toBe('idle')
    expect(snapshot.turns).toHaveLength(1)
    const [turn] = snapshot.turns
    expect(turn).toMatchObject({
      status: 'done',
      user: { text: PROMPT, delivery: 'delivered', uuid: 'rec-user-1' }
    })
    expect(turn!.items.map((item) => [item.kind, 'name' in item ? item.name : null])).toEqual([
      ['tool', 'Read'],
      ['tool', 'Edit'],
      ['text', null]
    ])
    for (const item of turn!.items) {
      expect(item).toMatchObject(item.kind === 'text' ? { streaming: false } : { status: 'done' })
    }
    expect(turn!.items[1]).toMatchObject({
      input: { file_path: '/fixture/site/style.css', old_string: expect.stringContaining('100vh') }
    })
  })

  it('gives the same turns from the durable records alone, as a transcript would', () => {
    const durable = RECORDS.filter((record) => record.type !== 'stream_event')
    expect(model(replayAll(durable)).turns).toEqual(model(replayAll(RECORDS)).turns)
  })

  it('decodes the same records whether stdout arrives whole or in small chunks', () => {
    const decode = (chunks: string[]): Rec[] => {
      const seen: Rec[] = []
      const decoder = createChatThreadStreamDecoder(
        't',
        () => undefined,
        (record) => seen.push(record as Rec)
      )
      for (const chunk of chunks) {
        decoder.push(chunk)
      }
      decoder.flush()
      return seen
    }
    const chunked = RAW.match(/[\s\S]{1,37}/g) ?? []
    expect(decode(chunked)).toEqual(decode([RAW]))
    expect(decode([RAW])).toEqual(RECORDS)
  })

  it('lands a window that joins after any prefix on the same model as the full replay', async () => {
    const expected = model(replayAll(RECORDS))
    const all = steps(RECORDS)
    for (let joinAt = 0; joinAt <= all.length; joinAt += 1) {
      const engine = new ChatEngine({ now: () => 1_000 })
      for (const step of all.slice(0, joinAt)) {
        play(engine, step)
      }
      const received: ChatEnginePatch[] = []
      let view: ChatEngineSnapshot | 'gap' = await engine.subscribe('t', {
        id: 1,
        send: (_channel, patch) => received.push(patch),
        isDestroyed: () => false
      })
      for (const step of all.slice(joinAt)) {
        play(engine, step)
        engine.flushAll()
      }
      for (const patch of received) {
        expect(view).not.toBe('gap')
        view = applyChatEnginePatch(view as ChatEngineSnapshot, patch)
      }
      expect(model(view as ChatEngineSnapshot), `joined at step ${joinAt}`).toEqual(expected)
    }
  })
})

describe('applyChatEnginePatch', () => {
  const base: ChatEngineSnapshot = replayAll(RECORDS)!

  it('ignores a patch the snapshot already includes', () => {
    expect(applyChatEnginePatch(base, { threadId: 't', version: base.version })).toBe(base)
  })

  it('reports a skipped version so the caller resubscribes', () => {
    expect(applyChatEnginePatch(base, { threadId: 't', version: base.version + 2 })).toBe('gap')
  })
})
