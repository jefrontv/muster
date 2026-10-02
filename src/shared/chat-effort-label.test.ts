import { describe, expect, it } from 'vitest'
import { resolveAgentSessionOptionLaunch } from './agent-session-option-launch'
import { resolveChatEffortLabel } from './chat-effort-label'

describe('resolveChatEffortLabel', () => {
  it("prefers Muster's applied effort, then Claude settings, then Default", () => {
    expect(resolveChatEffortLabel({ applied: 'medium', settings: 'high' })).toEqual({
      value: 'medium',
      source: 'muster'
    })
    expect(resolveChatEffortLabel({ applied: undefined, settings: 'high' })).toEqual({
      value: 'high',
      source: 'settings'
    })
    expect(resolveChatEffortLabel({ applied: null, settings: null })).toEqual({
      value: null,
      source: 'default'
    })
  })
})

describe('resolveAgentSessionOptionLaunch pickedOnly', () => {
  it('sends --effort only when the user picked one', () => {
    const unpicked = resolveAgentSessionOptionLaunch('claude', { model: 'opus' }, [], {
      pickedOnly: true
    })
    expect(unpicked.args).toEqual(['--model', 'opus'])
    expect(unpicked.appliedValues).toEqual({ model: 'opus' })
    const picked = resolveAgentSessionOptionLaunch(
      'claude',
      { model: 'opus', effort: 'medium' },
      [],
      { pickedOnly: true }
    )
    expect(picked.args).toEqual(['--model', 'opus', '--effort', 'medium'])
  })

  it('keeps filling catalog defaults for other callers', () => {
    expect(resolveAgentSessionOptionLaunch('claude', { model: 'opus' }).args).toContain('--effort')
  })
})
