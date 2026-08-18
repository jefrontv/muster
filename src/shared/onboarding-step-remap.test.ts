import { describe, expect, it } from 'vitest'
import { remapOnboardingLastCompletedStep } from './onboarding-step-remap'

const CURRENT = { flowVersion: 6, finalStep: 6 }

describe('remapOnboardingLastCompletedStep', () => {
  it('leaves current-version progress alone', () => {
    expect(
      remapOnboardingLastCompletedStep(
        { flowVersion: 6, lastCompletedStep: 3, outcome: null },
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
    ).toBe(6)
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
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(5)
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
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(5)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(5)
  })

  it('restarts v4 progress before integrations so the default-view page is seen', () => {
    const base = { flowVersion: 4, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 1 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 2 }, CURRENT)).toBe(0)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(5)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(6)
  })
})
