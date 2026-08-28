// Custom steps must count as real work: a run with every built-in toggle off but a custom step
// ticked is a run, not `no-steps-selected`. These pin that, plus the persisted-payload guard that
// stands between an MCP/renderer write and a command the pipeline will hand to a shell.

import { describe, expect, it } from 'vitest'
import {
  countSelectedSteps,
  createEmptySiteEnvironment,
  moveCustomStep,
  selectCustomSteps,
  type Site,
  type SiteCustomStep
} from '../../shared/site-types'
import { isSiteCustomStepArray } from '../ipc/sites-payload-validation'
import { buildSiteRunPlan } from './site-run-plan'

function step(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: 'step-1',
    name: 'Clear cache',
    group: 'deploy',
    runsOn: 'remote',
    command: 'wp cache flush',
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  }
}

function site(steps: SiteCustomStep[]): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: {
      main: { ...createEmptySiteEnvironment(), hostname: 'acme.example.com', username: 'deploy' }
    },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    customSteps: steps
  }
}

describe('selectCustomSteps', () => {
  it('returns before steps ahead of after steps, then by order', () => {
    const steps = [
      step({ id: 'after-2', position: 'after', order: 1, name: 'z' }),
      step({ id: 'after-1', position: 'after', order: 0, name: 'y' }),
      step({ id: 'before', position: 'before', order: 9, name: 'x' })
    ]
    expect(selectCustomSteps(site(steps), 'deploy').map((entry) => entry.id)).toEqual([
      'before',
      'after-1',
      'after-2'
    ])
  })

  it('excludes disabled steps and other groups', () => {
    const steps = [step({ id: 'off', enabled: false }), step({ id: 'import', group: 'import' })]
    expect(selectCustomSteps(site(steps), 'deploy')).toEqual([])
  })
})

describe('moveCustomStep', () => {
  const lane = [
    step({ id: 'a', name: 'a', order: 0 }),
    step({ id: 'b', name: 'b', order: 1 }),
    step({ id: 'c', name: 'c', order: 2 })
  ]

  const idsInOrder = (steps: SiteCustomStep[]): string[] =>
    [...steps].sort((left, right) => left.order - right.order).map((entry) => entry.id)

  it('moves a step later and renumbers the lane', () => {
    expect(idsInOrder(moveCustomStep(lane, 'a', 1))).toEqual(['b', 'a', 'c'])
  })

  it('moves a step earlier', () => {
    expect(idsInOrder(moveCustomStep(lane, 'c', -1))).toEqual(['a', 'c', 'b'])
  })

  it('is a no-op at either end of the lane', () => {
    expect(idsInOrder(moveCustomStep(lane, 'a', -1))).toEqual(['a', 'b', 'c'])
    expect(idsInOrder(moveCustomStep(lane, 'c', 1))).toEqual(['a', 'b', 'c'])
  })

  it('only reorders within the same group and position', () => {
    const mixed = [
      step({ id: 'deploy-after', order: 0 }),
      step({ id: 'deploy-before', position: 'before', order: 0 }),
      step({ id: 'import-after', group: 'import', order: 0 })
    ]
    const moved = moveCustomStep(mixed, 'deploy-after', 1)

    // Nothing to swap with in its own lane, so every step keeps its order.
    expect(moved.map((entry) => entry.order)).toEqual([0, 0, 0])
  })

  it('returns the list unchanged for an unknown id', () => {
    expect(moveCustomStep(lane, 'nope', 1)).toEqual(lane)
  })
})

describe('countSelectedSteps', () => {
  it('counts custom steps alongside built-in toggles', () => {
    const environment = { ...createEmptySiteEnvironment(), deployThemes: true }
    expect(countSelectedSteps(site([step()]), environment, 'deploy')).toBe(2)
  })
})

describe('buildSiteRunPlan with custom steps', () => {
  const planFor = (steps: SiteCustomStep[]) =>
    buildSiteRunPlan({
      site: site(steps),
      group: 'deploy',
      branch: 'main',
      hasSshSecret: () => true,
      pathExists: true
    })

  it('does not report no-steps-selected when only a custom step is enabled', () => {
    const plan = planFor([step()])
    expect(plan.enabledStepCount).toBe(1)
    expect(plan.blockedBy).not.toContain('no-steps-selected')
  })

  it('still reports no-steps-selected when the only custom step is disabled', () => {
    const plan = planFor([step({ enabled: false })])
    expect(plan.enabledStepCount).toBe(0)
    expect(plan.blockedBy).toContain('no-steps-selected')
  })

  it('lists the custom step in the plan so a preview shows what will run', () => {
    const plan = planFor([step({ name: 'Clear cache' })])
    expect(plan.steps).toContainEqual(
      expect.objectContaining({ key: 'custom:step-1', label: 'Clear cache', remote: true })
    )
  })
})

describe('isSiteCustomStepArray', () => {
  const valid = step()

  it('accepts a well-formed array', () => {
    expect(isSiteCustomStepArray([valid])).toBe(true)
    expect(isSiteCustomStepArray([])).toBe(true)
  })

  it('rejects a blank command, which would run an empty shell string and look like success', () => {
    expect(isSiteCustomStepArray([{ ...valid, command: '   ' }])).toBe(false)
  })

  it('rejects unknown keys rather than persisting them', () => {
    expect(isSiteCustomStepArray([{ ...valid, sudo: true }])).toBe(false)
  })

  it('rejects bad enums and missing identity', () => {
    expect(isSiteCustomStepArray([{ ...valid, group: 'nope' }])).toBe(false)
    expect(isSiteCustomStepArray([{ ...valid, runsOn: 'nope' }])).toBe(false)
    expect(isSiteCustomStepArray([{ ...valid, position: 'middle' }])).toBe(false)
    expect(isSiteCustomStepArray([{ ...valid, id: '' }])).toBe(false)
    expect(isSiteCustomStepArray([{ ...valid, name: '  ' }])).toBe(false)
  })

  it('rejects a non-array and an over-long command', () => {
    expect(isSiteCustomStepArray({})).toBe(false)
    expect(isSiteCustomStepArray([{ ...valid, command: 'x'.repeat(8_193) }])).toBe(false)
  })
})
