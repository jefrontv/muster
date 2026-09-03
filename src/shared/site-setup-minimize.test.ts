import { describe, expect, it } from 'vitest'
import {
  applyMinimizedFlowPatch,
  describeMinimizedFlow,
  primaryMinimizedFlow,
  removeMinimizedFlow,
  type MinimizedSiteSetupFlow
} from './site-setup-minimize'

function flow(overrides: Partial<MinimizedSiteSetupFlow> = {}): MinimizedSiteSetupFlow {
  return {
    id: 'a',
    label: 'acme',
    stage: 'Cloning',
    phase: 'running',
    percent: null,
    ...overrides
  }
}

describe('primaryMinimizedFlow', () => {
  it('reports nothing when nothing is minimized', () => {
    expect(primaryMinimizedFlow([])).toBeNull()
  })

  it('puts a flow needing the user ahead of one that is running', () => {
    // Why this order: a spinner is not actionable and a question is. Burying the question behind a
    // clone that will finish on its own is how a setup sits blocked and unnoticed.
    const chosen = primaryMinimizedFlow([
      flow({ id: 'running', phase: 'running' }),
      flow({ id: 'waiting', phase: 'waiting' })
    ])
    expect(chosen?.id).toBe('waiting')
  })

  it('puts a failure ahead of everything', () => {
    const chosen = primaryMinimizedFlow([
      flow({ id: 'waiting', phase: 'waiting' }),
      flow({ id: 'running', phase: 'running' }),
      flow({ id: 'broken', phase: 'error' })
    ])
    expect(chosen?.id).toBe('broken')
  })

  it('does not reorder the caller’s array', () => {
    const flows = [flow({ id: 'running', phase: 'running' }), flow({ id: 'stuck', phase: 'error' })]
    primaryMinimizedFlow(flows)
    expect(flows.map((entry) => entry.id)).toEqual(['running', 'stuck'])
  })
})

describe('describeMinimizedFlow', () => {
  it('names the site and the stage, because a bare spinner says nothing', () => {
    expect(describeMinimizedFlow(flow({ label: 'acme', stage: 'Cloning' }))).toBe('acme — Cloning')
  })

  it('includes progress when the stage reports it', () => {
    expect(describeMinimizedFlow(flow({ percent: 42.6 }))).toBe('acme — Cloning 43%')
  })

  it('omits progress for a stage with no measure', () => {
    expect(describeMinimizedFlow(flow({ stage: 'Needs a decision', percent: null }))).toBe(
      'acme — Needs a decision'
    )
  })
})

describe('applyMinimizedFlowPatch', () => {
  it('ignores a report for a flow that is not minimized', () => {
    // Why: the dialog reports whether or not it is minimized. Re-creating a flow the user just
    // restored would leave a chip they cannot get rid of.
    const flows = {}
    expect(applyMinimizedFlowPatch(flows, 'gone', { stage: 'Cloning' })).toBe(flows)
  })

  it('returns the identical object when nothing actually changed', () => {
    // Identity, not equality: a new object would re-render the status bar on every frame of a clone.
    const flows = { a: flow() }
    expect(applyMinimizedFlowPatch(flows, 'a', { stage: 'Cloning', phase: 'running' })).toBe(flows)
  })

  it('applies a real change without touching the other flows', () => {
    const other = flow({ id: 'b', label: 'other' })
    const flows = { a: flow(), b: other }
    const next = applyMinimizedFlowPatch(flows, 'a', { percent: 50 })
    expect(next).not.toBe(flows)
    expect(next.a?.percent).toBe(50)
    expect(next.b).toBe(other)
  })

  it('carries a phase change through, since that is what swaps spinner for pulse', () => {
    const next = applyMinimizedFlowPatch({ a: flow() }, 'a', { phase: 'waiting' })
    expect(next.a?.phase).toBe('waiting')
  })
})

describe('removeMinimizedFlow', () => {
  it('drops the flow', () => {
    expect(removeMinimizedFlow({ a: flow() }, 'a')).toEqual({})
  })

  it('returns the identical object for an id that is not there', () => {
    const flows = { a: flow() }
    expect(removeMinimizedFlow(flows, 'missing')).toBe(flows)
  })

  it('leaves the other flows alone', () => {
    const other = flow({ id: 'b' })
    const next = removeMinimizedFlow({ a: flow(), b: other }, 'a')
    expect(next.b).toBe(other)
    expect(next.a).toBeUndefined()
  })
})
