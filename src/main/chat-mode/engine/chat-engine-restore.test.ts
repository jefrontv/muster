import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatEngine, type ChatEngineSubscriber } from './chat-engine'
import { writeChatEngineSnapshot } from './chat-engine-persistence'
import { createChatEngineRestore } from './chat-engine-restore'
import { hydrateChatEngineFromTranscript } from './chat-engine-transcript'

const subscriber = (id: number): ChatEngineSubscriber => ({
  id,
  send: () => undefined,
  isDestroyed: () => false
})

const at = (seconds: number) => `2026-09-28T01:00:${String(seconds).padStart(2, '0')}.000Z`

const TRANSCRIPT = [
  { type: 'permission-mode', permissionMode: 'default' },
  {
    type: 'user',
    uuid: 'u-1',
    timestamp: at(0),
    message: { role: 'user', content: 'Why does the menu overlap?' }
  },
  {
    type: 'assistant',
    apiBlockIndex: 0,
    timestamp: at(2),
    message: {
      id: 'm1',
      content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'a.scss' } }]
    }
  },
  {
    type: 'user',
    timestamp: at(3),
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'e1', content: 'Updated a.scss' }]
    },
    toolUseResult: {
      filePath: 'a.scss',
      structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }]
    }
  },
  {
    type: 'assistant',
    apiBlockIndex: 1,
    timestamp: at(4),
    message: { id: 'm1', content: [{ type: 'text', text: 'Fixed the height.' }] }
  },
  { type: 'system', subtype: 'turn_duration', durationMs: 4_000, timestamp: at(4) },
  {
    type: 'user',
    isCompactSummary: true,
    timestamp: at(5),
    message: { role: 'user', content: 'This session is being continued...' }
  },
  {
    type: 'user',
    uuid: 'u-2',
    timestamp: at(6),
    message: { role: 'user', content: [{ type: 'text', text: 'Now the footer' }] }
  },
  {
    type: 'user',
    timestamp: at(7),
    interruptedMessageId: 'm2',
    message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] }
  }
]
  .map((record) => JSON.stringify(record))
  .join('\n')

describe('chat engine history', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chat-engine-restore-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })

  it('rebuilds turns, tool diffs and interruptions from a transcript', async () => {
    const path = join(dir, 'session.jsonl')
    await writeFile(path, `${TRANSCRIPT}\n{"truncated`)
    const snapshot = await hydrateChatEngineFromTranscript('t1', path, 0)
    expect(snapshot?.turns.map((turn) => [turn.user?.text, turn.user?.uuid, turn.status])).toEqual([
      ['Why does the menu overlap?', 'u-1', 'done'],
      ['Now the footer', 'u-2', 'interrupted']
    ])
    expect(snapshot?.turns[0]).toMatchObject({
      durationMs: 4_000,
      startedAt: Date.parse(at(0)),
      items: [
        { kind: 'tool', id: 'e1', status: 'done', result: { additions: 1, deletions: 1 } },
        { kind: 'text', id: 'm1#1', text: 'Fixed the height.' }
      ]
    })
    expect(snapshot?.meta).toMatchObject({ status: 'idle', pending: [] })
  })

  it('keeps saved history when the process attaches before anyone subscribes', async () => {
    const earlier = new ChatEngine({ persistDir: () => dir })
    await earlier.subscribe('t2', subscriber(1))
    earlier.userMessage('t2', {
      id: 'local-107',
      text: 'Earlier question',
      imageCount: 0,
      steer: false
    })
    earlier.ingest('t2', { type: 'result', subtype: 'success', duration_ms: 1, total_cost_usd: 0 })
    await vi.waitFor(async () =>
      expect(await readFile(join(dir, 't2.json'), 'utf-8')).toContain('Earlier question')
    )

    const engine = new ChatEngine({ persistDir: () => dir })
    engine.attachProcess('t2', () => true)
    engine.userMessage('t2', { id: 'local-115', text: 'New question', imageCount: 0, steer: false })
    engine.ingest('t2', { type: 'result', subtype: 'success', duration_ms: 1, total_cost_usd: 0 })
    const snapshot = await engine.subscribe('t2', subscriber(2))
    expect(snapshot.turns.map((turn) => turn.user?.text)).toEqual([
      'Earlier question',
      'New question'
    ])
    await vi.waitFor(async () => {
      const saved = JSON.parse(await readFile(join(dir, 't2.json'), 'utf-8'))
      expect(saved.snapshot.turns).toHaveLength(2)
    })
  })

  it('prefers the transcript once it is newer than the snapshot', async () => {
    const transcript = join(dir, 'session.jsonl')
    await writeFile(transcript, TRANSCRIPT)
    const restore = createChatEngineRestore({
      persistDir: () => dir,
      transcriptPathFor: async () => transcript
    })
    const savedAt = Date.now()
    await writeChatEngineSnapshot(
      dir,
      {
        version: 3,
        meta: { ...(await hydrateChatEngineFromTranscript('t3', transcript, 0))!.meta },
        turns: []
      },
      savedAt
    )
    const inSync = new Date(savedAt + 5_000)
    await utimes(transcript, inSync, inSync)
    expect((await restore('t3'))?.turns).toEqual([])

    const continuedElsewhere = new Date(savedAt + 60_000)
    await utimes(transcript, continuedElsewhere, continuedElsewhere)
    expect((await restore('t3'))?.turns).toHaveLength(2)
  })
})
