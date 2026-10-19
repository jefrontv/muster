import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatEngineItem,
  ChatEnginePatch,
  ChatEngineSnapshot,
  ChatEngineThreadMeta,
  ChatEngineTurn
} from '../../../../shared/chat-engine-types'
import {
  createChatEngineThreadStore,
  scheduleChatEngineFrame,
  type ChatEngineThreadStore
} from './chat-engine-thread-store'
import { replaceEqualDeep } from './chat-engine-structural-sharing'

const meta = (status: ChatEngineThreadMeta['status'] = 'idle'): ChatEngineThreadMeta => ({
  threadId: 't1',
  status,
  session: {
    sessionId: null,
    model: null,
    effort: null,
    permissionMode: null,
    cwd: null,
    cliVersion: null,
    tools: [],
    slashCommands: [],
    mcpServers: []
  },
  pending: [],
  queue: { items: [], paused: false },
  todos: null,
  suggestions: [],
  contextUsage: null,
  tasks: [],
  totalCostUsd: 0,
  compacting: false,
  lastError: null
})

const turn = (id: string, items: ChatEngineItem[] = []): ChatEngineTurn => ({
  id,
  index: 0,
  user: null,
  items,
  status: 'running',
  startedAt: 0,
  endedAt: null,
  durationMs: null,
  costUsd: null,
  errorMessage: null,
  toolSummaries: []
})

const text = (id: string, value: string): ChatEngineItem => ({
  kind: 'text',
  id,
  text: value,
  streaming: true
})

// IPC structured-clones every payload.
const clone = <T>(value: T): T => structuredClone(value)

function harness(initial: ChatEngineSnapshot) {
  let emit: (patch: ChatEnginePatch) => void = () => undefined
  const frames: (() => void)[] = []
  const snapshots = [initial]
  const api = {
    subscribe: vi.fn(async () => clone(snapshots.shift() ?? initial)),
    unsubscribe: vi.fn(async () => undefined),
    onPatch: vi.fn((callback: (patch: ChatEnginePatch) => void) => {
      emit = callback
      return () => undefined
    })
  }
  const store = createChatEngineThreadStore({
    api,
    scheduleFrame: (callback) => frames.push(callback),
    releaseDelayMs: 10
  })
  return {
    api,
    store,
    patch: (patch: Omit<ChatEnginePatch, 'threadId'>) => emit(clone({ threadId: 't1', ...patch })),
    frame: () => frames.splice(0).forEach((callback) => callback()),
    nextSnapshot: (snapshot: ChatEngineSnapshot) => snapshots.push(snapshot)
  }
}

describe('scheduleChatEngineFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('still runs once when the window paints no frames', () => {
    vi.useFakeTimers()
    const frames: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
    const callback = vi.fn()
    scheduleChatEngineFrame(callback)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
    frames.forEach((frame) => frame())
    expect(callback).toHaveBeenCalledTimes(1)
  })
})

describe('replaceEqualDeep', () => {
  it('keeps every unchanged subtree and only rebuilds the changed path', () => {
    const prev = { a: { x: [1, 2] }, b: { y: 'old' } }
    const next = replaceEqualDeep(prev, { a: { x: [1, 2] }, b: { y: 'new' } })
    expect(next.a).toBe(prev.a)
    expect(next.b).not.toBe(prev.b)
    expect(next).toEqual({ a: { x: [1, 2] }, b: { y: 'new' } })
    expect(replaceEqualDeep(prev, clone(prev))).toBe(prev)
  })

  it('treats added and removed keys as changes', () => {
    const prev: Record<string, unknown> = { a: 1, b: undefined }
    expect(replaceEqualDeep(prev, { a: 1, c: undefined })).not.toBe(prev)
    expect(replaceEqualDeep([1, 2], [1])).toEqual([1])
  })
})

describe('chat engine thread store', () => {
  let store: ChatEngineThreadStore | null = null
  afterEach(() => store?.dispose())

  it('loads the snapshot and folds patches that raced ahead of it', async () => {
    const h = harness({ version: 3, meta: meta(), turns: [turn('a', [text('a#0', 'Hi')])] })
    store = h.store
    h.store.retain('t1')
    // Main flushes to the new subscriber before the snapshot reply lands.
    h.patch({ version: 3, meta: meta('working') })
    h.patch({ version: 4, turns: [turn('b')] })
    await vi.waitFor(() => expect(h.api.subscribe).toHaveBeenCalledOnce())
    await Promise.resolve()
    h.frame()
    expect(h.store.read('t1')?.order).toEqual(['a', 'b'])
    expect(h.store.read('t1')?.version).toBe(4)
    // v3 was already in the snapshot, so its meta is not applied twice.
    expect(h.store.read('t1')?.meta.status).toBe('idle')
  })

  it('tells listeners once per frame and keeps untouched turns and items', async () => {
    const h = harness({
      version: 1,
      meta: meta(),
      turns: [turn('a', [text('a#0', 'done')]), turn('b', [text('b#0', 'x'), text('b#1', 'y')])]
    })
    store = h.store
    const listener = vi.fn()
    h.store.subscribe('t1', listener)
    h.store.retain('t1')
    await vi.waitFor(() => expect(h.api.subscribe).toHaveBeenCalledOnce())
    await Promise.resolve()
    h.frame()
    const before = h.store.read('t1')!
    listener.mockClear()

    h.patch({ version: 2, turns: [turn('b', [text('b#0', 'x'), text('b#1', 'y!')])] })
    h.patch({ version: 3, turns: [turn('b', [text('b#0', 'x'), text('b#1', 'y!!')])] })
    expect(listener).not.toHaveBeenCalled()
    h.frame()
    expect(listener).toHaveBeenCalledOnce()

    const after = h.store.read('t1')!
    expect(after.order).toBe(before.order)
    expect(after.meta).toBe(before.meta)
    expect(after.turns.get('a')).toBe(before.turns.get('a'))
    const [first, second] = after.turns.get('b')!.items
    expect(first).toBe(before.turns.get('b')!.items[0])
    expect(second).toMatchObject({ text: 'y!!' })
  })

  it('resubscribes on a version gap and keeps identity across the fresh snapshot', async () => {
    const h = harness({ version: 1, meta: meta(), turns: [turn('a')] })
    store = h.store
    h.store.retain('t1')
    await vi.waitFor(() => expect(h.api.subscribe).toHaveBeenCalledOnce())
    await Promise.resolve()
    h.frame()
    const stale = h.store.read('t1')!

    h.nextSnapshot({ version: 5, meta: meta(), turns: [turn('a'), turn('b')] })
    h.patch({ version: 3, turns: [turn('b')] })
    expect(h.store.read('t1')).toBe(stale)
    await vi.waitFor(() => expect(h.api.subscribe).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    h.frame()
    const fresh = h.store.read('t1')!
    expect(fresh.version).toBe(5)
    expect(fresh.order).toEqual(['a', 'b'])
    expect(fresh.turns.get('a')).toBe(stale.turns.get('a'))
  })

  it('unsubscribes only after the last holder lets go and the delay passes', async () => {
    vi.useFakeTimers()
    try {
      const h = harness({ version: 1, meta: meta(), turns: [] })
      store = h.store
      const first = h.store.retain('t1')
      const second = h.store.retain('t1')
      first()
      first()
      second()
      h.store.retain('t1')()
      await vi.advanceTimersByTimeAsync(9)
      expect(h.api.unsubscribe).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(h.api.unsubscribe).toHaveBeenCalledOnce()
      expect(h.api.subscribe).toHaveBeenCalledOnce()
      expect(h.store.read('t1')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
