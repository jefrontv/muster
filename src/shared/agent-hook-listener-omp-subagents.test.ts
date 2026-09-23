import { describe, expect, it } from 'vitest'
import {
  clearPaneCacheState,
  createHookListenerState,
  normalizeHookPayload,
  type HookListenerState
} from './agent-hook-listener'
import { makePaneKey } from './stable-pane-id'

const PANE_KEY = makePaneKey('tab-omp', '22222222-2222-4222-8222-222222222222')

function ompEvent(
  state: HookListenerState,
  payload: Record<string, unknown>
): ReturnType<typeof normalizeHookPayload> {
  return normalizeHookPayload(state, 'omp', { paneKey: PANE_KEY, payload }, 'production')
}

const scout = (id: string): Record<string, unknown> => ({
  id,
  agentType: 'scout',
  description: `${id} task`,
  state: 'working',
  startedAt: 1
})

describe('omp sub-agent status', () => {
  it('passes the extension roster through as sub-agent rows', () => {
    const state = createHookListenerState()
    const started = ompEvent(state, {
      hook_event_name: 'tool_execution_start',
      tool_name: 'task',
      subagents: [scout('ListScout'), scout('NameScout')]
    })

    expect(started?.payload.state).toBe('working')
    expect(started?.payload.subagents?.map((entry) => entry.id)).toEqual(['ListScout', 'NameScout'])
  })

  it('keeps a finished lead working while a sub-agent still runs', () => {
    const state = createHookListenerState()
    ompEvent(state, { hook_event_name: 'agent_start', subagents: [] })
    const ended = ompEvent(state, { hook_event_name: 'agent_end', subagents: [scout('ListScout')] })
    expect(ended?.payload.state).toBe('working')

    const lastFinished = ompEvent(state, { hook_event_name: 'subagent_lifecycle', subagents: [] })
    expect(lastFinished?.payload.state).toBe('done')
    expect(lastFinished?.payload.subagents).toBeUndefined()
  })

  it('re-emits the lead state on a sub-agent change without touching the tool snapshot', () => {
    const state = createHookListenerState()
    ompEvent(state, {
      hook_event_name: 'tool_execution_start',
      tool_name: 'bash',
      tool_input: { command: 'ls' },
      subagents: []
    })

    const changed = ompEvent(state, {
      hook_event_name: 'subagent_lifecycle',
      subagents: [scout('ListScout')]
    })

    expect(changed?.payload.state).toBe('working')
    expect(changed?.payload.toolName).toBe('bash')
    expect(changed?.payload.subagents?.map((entry) => entry.id)).toEqual(['ListScout'])
  })

  it('leaves the roster alone when an older extension sends no sub-agent field', () => {
    const state = createHookListenerState()
    ompEvent(state, { hook_event_name: 'agent_start', subagents: [scout('ListScout')] })

    const legacy = ompEvent(state, { hook_event_name: 'tool_execution_end', tool_name: 'read' })

    expect(legacy?.payload.subagents?.map((entry) => entry.id)).toEqual(['ListScout'])
  })

  it('clears the omp roster and lead state with the pane', () => {
    const state = createHookListenerState()
    ompEvent(state, { hook_event_name: 'agent_start', subagents: [scout('ListScout')] })

    clearPaneCacheState(state, PANE_KEY)

    expect(state.ompSubagentRosterByPaneKey.size).toBe(0)
    expect(state.ompLeadStateByPaneKey.size).toBe(0)
  })

  it('ignores sub-agent fields on plain pi panes', () => {
    const state = createHookListenerState()
    const status = normalizeHookPayload(
      state,
      'pi',
      { paneKey: PANE_KEY, payload: { hook_event_name: 'agent_end', subagents: [scout('X')] } },
      'production'
    )

    expect(status?.payload.state).toBe('done')
    expect(status?.payload.subagents).toBeUndefined()
  })
})
