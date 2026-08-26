import { describe, expect, it } from 'vitest'
import { remapOnboardingLastCompletedStep } from './onboarding-step-remap'

const CURRENT = { flowVersion: 8, finalStep: 8 }

describe('remapOnboardingLastCompletedStep', () => {
  it('leaves current-version progress alone', () => {
    expect(
      remapOnboardingLastCompletedStep(
        { flowVersion: 8, lastCompletedStep: 3, outcome: null },
        CURRENT
      )
    ).toBe(3)
  })

  it('maps completed legacy progress to the current final step', () => {
    expect(
      remapOnboardingLastCompletedStep(
        { flowVersion: 1, lastCompletedStep: 7, outcome: 'completed' },
        CURRENT
      )
    ).toBe(8)
  })

  it('restarts v5 progress that never reached default_view on the new first step', () => {
    const base = { flowVersion: 5, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 0 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 1 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 2 }, CURRENT)).toBe(0)
  })

  it('keeps v5 progress that already passed default_view on the same number', () => {
    const base = { flowVersion: 5, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(3)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(7)
  })

  it('remaps unversioned seven-step open progress through v4', () => {
    const base = { flowVersion: 1, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(4)
  })

  it('remaps versioned five-step open progress through v4', () => {
    const base = { flowVersion: 2, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(4)
  })

  it('remaps versioned four-step open progress around Windows and default view', () => {
    const base = { flowVersion: 3, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(7)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(7)
  })

  it('restarts v4 progress before integrations so the default-view page is seen', () => {
    const base = { flowVersion: 4, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 1 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 2 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(7)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(8)
  })

  it('lands v6 progress on the first inserted site step instead of past it', () => {
    const base = { flowVersion: 6, outcome: null }
    // Untouched: everything up to and including integrations kept its number.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(3)
    // Finished integrations, so site_sources — the first of the two inserted steps — is next.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(4)
    // Past them already: windows_terminal and notifications each shift two later.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(7)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 6 }, CURRENT)).toBe(8)
  })

  it('lands v7 progress on the inserted site_sources step instead of past it', () => {
    const base = { flowVersion: 7, outcome: null }
    // Before the insertion point: unchanged.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(3)
    // Finished integrations, so the new step is exactly what comes next.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(4)
    // Already past site_mcp: it and everything after it shift one later.
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(6)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 6 }, CURRENT)).toBe(7)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 7 }, CURRENT)).toBe(8)
  })
})
