import { describe, expect, it } from 'vitest'

import { createHarness, type HookContext } from './agent-status-extension-harness.test-fixture'

function sessionContext(id: string, file = ''): HookContext {
  return { sessionManager: { getSessionId: () => id, getSessionFile: () => file || undefined } }
}

// Why: posts drain through a latest-only queue; let it empty before asserting what went out.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function postedEvents(harness: ReturnType<typeof createHarness>): string[] {
  return harness.fetchMock.mock.calls.map(
    (call) => JSON.parse(String(call[1]?.body)).payload.hook_event_name as string
  )
}

// Why: omp runs sub-agents in the lead's process and re-binds the extension factory for each
// one, so the PID owner guard alone lets them post as the lead pane.
describe('in-process omp sub-agent bindings', () => {
  it('stays silent for a sub-agent whose transcript is nested under the lead', async () => {
    const harness = createHarness({
      kind: 'omp',
      existsSync: (path) => path === '/s/lead.jsonl'
    })
    await harness.callHook('agent_start', {}, sessionContext('lead-1', '/s/lead.jsonl'))

    const subagent = harness.bindSession()
    const subagentContext = sessionContext('scout-1', '/s/lead/RaaToggleScout.jsonl')
    await subagent.agent_start?.({}, subagentContext)
    await subagent.tool_execution_start?.({ toolName: 'read', args: {} }, subagentContext)
    await subagent.agent_end?.({}, subagentContext)
    await settle()

    expect(postedEvents(harness)).toEqual(['agent_start'])
  })

  it('stays silent for an in-memory sub-agent of a lead without a transcript', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))

    const subagent = harness.bindSession()
    await subagent.agent_start?.({}, sessionContext('scout-1'))
    await subagent.agent_end?.({}, sessionContext('scout-1'))
    await settle()

    expect(postedEvents(harness)).toEqual(['agent_start'])
  })

  it('stays silent for a sub-agent whose transcript sits in a temp artifacts dir', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))

    const subagent = harness.bindSession()
    const subagentContext = sessionContext('scout-1', '/tmp/omp-task-1/ListScout.jsonl')
    await subagent.agent_start?.({}, subagentContext)
    await subagent.agent_end?.({}, subagentContext)
    await settle()

    expect(postedEvents(harness)).toEqual(['agent_start'])
  })

  it('keeps the lead session id after a sub-agent runs', async () => {
    const harness = createHarness({
      kind: 'omp',
      existsSync: (path) => path === '/s/lead.jsonl'
    })
    const leadContext = sessionContext('lead-1', '/s/lead.jsonl')
    await harness.callHook('agent_start', {}, leadContext)
    const subagent = harness.bindSession()
    await subagent.agent_start?.({}, sessionContext('scout-1', '/s/lead/Scout.jsonl'))
    await harness.callHook('tool_execution_start', { toolName: 'read', args: {} }, leadContext)

    await settle()
    expect(harness.fetchMock.mock.calls).toHaveLength(2)
    const lastBody = JSON.parse(String(harness.fetchMock.mock.calls[1]?.[1]?.body))
    expect(lastBody.payload.session_id).toBe('lead-1')
  })

  it('keeps reporting for a forked session that sits beside its parent', async () => {
    const harness = createHarness({
      kind: 'omp',
      existsSync: (path) => path === '/s/parent.jsonl' || path === '/s/fork.jsonl'
    })

    await harness.callHook('agent_start', {}, sessionContext('fork-1', '/s/fork.jsonl'))

    expect(postedEvents(harness)).toEqual(['agent_start'])
  })

  it('keeps reporting when the lead re-binds with its own session', async () => {
    const harness = createHarness({ kind: 'omp' })
    await harness.callHook('agent_start', {}, sessionContext('lead-1'))

    const reloaded = harness.bindSession()
    await reloaded.agent_end?.({}, sessionContext('lead-1'))

    await expect.poll(() => postedEvents(harness)).toEqual(['agent_start', 'agent_end'])
  })
})
