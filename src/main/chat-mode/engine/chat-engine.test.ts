import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEnginePatch } from '../../../shared/chat-engine-types'
import { ChatEngine, type ChatEngineSubscriber } from './chat-engine'
import { ChatEngineControlClient } from './chat-engine-control'

function subscriber(id: number): ChatEngineSubscriber & { patches: ChatEnginePatch[] } {
  const patches: ChatEnginePatch[] = []
  return { id, patches, send: (_channel, patch) => patches.push(patch), isDestroyed: () => false }
}

describe('ChatEngineControlClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('correlates responses by request id and rejects errors', async () => {
    const written: Record<string, unknown>[] = []
    const client = new ChatEngineControlClient((payload) => {
      written.push(payload as Record<string, unknown>)
      return true
    })
    const usage = client.request('get_context_usage')
    const model = client.request('set_model', { model: 'haiku' })
    expect(written).toEqual([
      {
        type: 'control_request',
        request_id: 'muster_1',
        request: { subtype: 'get_context_usage' }
      },
      {
        type: 'control_request',
        request_id: 'muster_2',
        request: { subtype: 'set_model', model: 'haiku' }
      }
    ])
    expect(
      client.handleRecord({
        type: 'control_response',
        response: { subtype: 'error', request_id: 'muster_2', error: 'Unknown model' }
      })
    ).toBe(true)
    expect(
      client.handleRecord({
        type: 'control_response',
        response: { subtype: 'success', request_id: 'muster_1', response: { totalTokens: 10 } }
      })
    ).toBe(true)
    await expect(usage).resolves.toEqual({ totalTokens: 10 })
    await expect(model).rejects.toThrow('Unknown model')
    expect(
      client.handleRecord({
        type: 'control_response',
        response: { subtype: 'success', request_id: 'perm-9' }
      })
    ).toBe(false)
  })

  it('times out, fails fast when stdin is closed, and rejects everything on dispose', async () => {
    const client = new ChatEngineControlClient(() => true, 500)
    const slow = client.request('mcp_status')
    vi.advanceTimersByTime(501)
    await expect(slow).rejects.toThrow('did not answer')

    await expect(new ChatEngineControlClient(() => false).request('interrupt')).rejects.toThrow(
      'not accepting input'
    )

    const pending = client.request('list_models')
    client.dispose()
    await expect(pending).rejects.toThrow('has ended')
    await expect(client.request('list_models')).rejects.toThrow('has ended')
  })
})

describe('ChatEngine', () => {
  let dir: string
  beforeEach(async () => {
    vi.useFakeTimers()
    dir = await mkdtemp(join(tmpdir(), 'chat-engine-'))
  })
  afterEach(async () => {
    vi.useRealTimers()
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })

  it('sends coalesced patches that carry only changed turns', async () => {
    const engine = new ChatEngine({ now: () => 1_000, persistDir: () => dir })
    const sub = subscriber(1)
    await engine.subscribe('t1', sub)
    engine.userMessage('t1', { id: 'local-92', text: 'One', imageCount: 0, steer: false })
    engine.ingest('t1', { type: 'result', subtype: 'success', duration_ms: 5, total_cost_usd: 0 })
    engine.userMessage('t1', { id: 'local-94', text: 'Two', imageCount: 0, steer: false })
    vi.advanceTimersByTime(60)
    const first = sub.patches.at(-1)
    expect(first?.turns?.map((turn) => turn.user?.text)).toEqual(['One', 'Two'])

    engine.ingest('t1', { type: 'result', subtype: 'success', duration_ms: 5, total_cost_usd: 0 })
    vi.advanceTimersByTime(60)
    const second = sub.patches.at(-1)
    expect(second?.turns?.map((turn) => turn.user?.text)).toEqual(['Two'])
    expect(second?.version).toBeGreaterThan(first?.version ?? 0)
  })

  it('restores a thread from its snapshot without pending requests', async () => {
    const engine = new ChatEngine({ now: () => 1_000, persistDir: () => dir })
    engine.userMessage('t2', { id: 'local-108', text: 'Remember me', imageCount: 0, steer: false })
    engine.ingest('t2', {
      type: 'control_request',
      request_id: 'r',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {} }
    })
    engine.ingest('t2', { type: 'result', subtype: 'success', duration_ms: 5, total_cost_usd: 0.5 })
    await vi.waitFor(async () => {
      const raw = JSON.parse(await readFile(join(dir, 't2.json'), 'utf-8'))
      expect(raw.snapshot.turns[0].user.text).toBe('Remember me')
    })

    const reopened = new ChatEngine({ now: () => 2_000, persistDir: () => dir })
    const snapshot = await reopened.subscribe('t2', subscriber(2))
    expect(snapshot.turns.map((turn) => turn.user?.text)).toEqual(['Remember me'])
    expect(snapshot.meta).toMatchObject({ pending: [], status: 'idle', totalCostUsd: 0.5 })
  })

  it('routes control responses to the process control client, not the model', async () => {
    const written: unknown[] = []
    const engine = new ChatEngine({ now: () => 1_000 })
    const control = engine.attachProcess('t3', (payload) => {
      written.push(payload)
      return true
    })
    expect(engine.snapshot('t3')?.meta.status).toBe('starting')
    const usage = control.request('get_context_usage')
    engine.ingest('t3', {
      type: 'control_response',
      response: { subtype: 'success', request_id: 'muster_1', response: { totalTokens: 1 } }
    })
    await expect(usage).resolves.toEqual({ totalTokens: 1 })
    expect(engine.snapshot('t3')?.turns).toEqual([])
  })

  it('ignores the exit of a process a relaunch already replaced', () => {
    const engine = new ChatEngine({ now: () => 1_000 })
    const old = engine.attachProcess('t4', () => true)
    const fresh = engine.attachProcess('t4', () => true)
    engine.setCapabilities('t4', fresh, {
      commands: [{ name: 'compact', description: 'Compact', argumentHint: '' }],
      models: [{ value: 'opus', displayName: 'Opus', supportedEffortLevels: ['high', 'bogus'] }]
    })
    engine.setCapabilities('t4', old, { commands: [] })
    engine.userMessage('t4', { id: 'local-152', text: 'Keep going', imageCount: 0, steer: false })
    engine.processExited('t4', old, { stopping: true, error: null })
    expect(engine.snapshot('t4')?.turns.at(-1)?.status).toBe('running')
    expect(engine.control('t4')).toBe(fresh)
    expect(engine.capabilities('t4')).toMatchObject({
      commands: [{ name: 'compact' }],
      models: [{ value: 'opus', displayName: 'Opus', effortLevels: ['high'] }]
    })
  })
})
