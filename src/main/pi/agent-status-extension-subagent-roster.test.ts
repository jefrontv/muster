import { describe, expect, it } from 'vitest'

import { createHarness, type HookContext } from './agent-status-extension-harness.test-fixture'

const LIFECYCLE = 'task:subagent:lifecycle'

function sessionContext(id: string, extra: Record<string, unknown> = {}): HookContext {
  return { sessionManager: { getSessionId: () => id }, ...extra } as HookContext
}

// Why: posts drain through a latest-only queue; let it empty before asserting what went out.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function payloads(harness: ReturnType<typeof createHarness>): Record<string, unknown>[] {
  return harness.fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).payload)
}

function lastSubagentIds(harness: ReturnType<typeof createHarness>): string[] {
  const last = payloads(harness).at(-1)
  return ((last?.subagents as { id: string }[] | undefined) ?? []).map((entry) => entry.id)
}

describe('omp sub-agent roster', () => {
  it('posts each sub-agent start and finish with the full roster', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))
    await settle()

    harness.emitBus(LIFECYCLE, {
      id: 'ListScout',
      agent: 'scout',
      description: 'List notes',
      status: 'started'
    })
    await settle()
    const started = payloads(harness).at(-1)
    expect(started?.hook_event_name).toBe('subagent_lifecycle')
    expect(started?.subagents).toEqual([
      expect.objectContaining({
        id: 'ListScout',
        agentType: 'scout',
        description: 'List notes',
        state: 'working'
      })
    ])

    harness.emitBus(LIFECYCLE, { id: 'ListScout', agent: 'scout', status: 'completed' })
    await settle()
    expect(payloads(harness).at(-1)).toMatchObject({
      hook_event_name: 'subagent_lifecycle',
      subagents: []
    })
  })

  it('keeps both starts when a burst coalesces in the latest-only queue', async () => {
    let finish: (() => void) | undefined
    const harness = createHarness({
      kind: 'omp',
      fetchImpl: () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true })
        })
    })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))

    harness.emitBus(LIFECYCLE, { id: 'A', agent: 'scout', status: 'started' })
    harness.emitBus(LIFECYCLE, { id: 'B', agent: 'scout', status: 'started' })
    finish?.()
    await settle()
    finish?.()
    await settle()

    expect(harness.fetchMock).toHaveBeenCalledTimes(2)
    expect(lastSubagentIds(harness)).toEqual(['A', 'B'])
  })

  it('ignores frames seen by a sub-agent binding', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))
    const subagent = harness.bindSession()
    await subagent.agent_start?.({}, sessionContext('scout-1'))
    await settle()

    await subagent[`bus:${LIFECYCLE}`]?.({ id: 'Grandchild', agent: 'scout', status: 'started' })
    await settle()

    expect(payloads(harness).map((payload) => payload.hook_event_name)).toEqual(['agent_start'])
  })

  it('drops sub-agents omp no longer lists as running when the lead ends', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))
    harness.emitBus(LIFECYCLE, { id: 'Kept', agent: 'scout', status: 'started' })
    harness.emitBus(LIFECYCLE, { id: 'Missed', agent: 'scout', status: 'started' })
    await settle()

    await harness.callHook(
      'agent_end',
      {},
      sessionContext('lead-1', {
        getAsyncJobSnapshot: () => ({ running: [{ id: 'Kept', status: 'running' }] })
      })
    )
    await settle()

    expect(payloads(harness).at(-1)?.hook_event_name).toBe('agent_end')
    expect(lastSubagentIds(harness)).toEqual(['Kept'])
  })

  it('clamps long nested ids to the 64-character cap without collisions', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))
    const base = 'Parent.'.repeat(12)
    harness.emitBus(LIFECYCLE, { id: `${base}One`, status: 'started' })
    harness.emitBus(LIFECYCLE, { id: `${base}Two`, status: 'started' })
    await settle()

    const ids = lastSubagentIds(harness)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(64)
    }
  })

  it('sends no roster from plain pi', async () => {
    const harness = createHarness({ kind: 'pi' })
    await harness.callHook('agent_start', {}, sessionContext('pi-1'))
    await settle()

    expect(payloads(harness)[0]).not.toHaveProperty('subagents')
  })
})
