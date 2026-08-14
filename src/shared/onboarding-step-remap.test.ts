import { describe, expect, it } from 'vitest'
import { remapOnboardingLastCompletedStep } from './onboarding-step-remap'

const CURRENT = { flowVersion: 5, finalStep: 6 }

describe('remapOnboardingLastCompletedStep', () => {
  it('leaves current-version progress alone', () => {
    expect(
      remapOnboardingLastCompletedStep(
        { flowVersion: 5, lastCompletedStep: 3, outcome: null },
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

  it('remaps unversioned seven-step open progress through v4 then v5', () => {
    const base = { flowVersion: 1, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(2)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(2)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(4)
  })

  it('remaps versioned five-step open progress through v4 then v5', () => {
    const base = { flowVersion: 2, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(2)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(4)
  })

  it('remaps versioned four-step open progress around Windows then default view', () => {
    const base = { flowVersion: 3, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(5)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 9 }, CURRENT)).toBe(5)
  })

  it('shifts v4 progress after theme so the new default-view page is seen', () => {
    const base = { flowVersion: 4, outcome: null }
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 2 }, CURRENT)).toBe(2)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 3 }, CURRENT)).toBe(4)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 4 }, CURRENT)).toBe(5)
    expect(remapOnboardingLastCompletedStep({ ...base, lastCompletedStep: 5 }, CURRENT)).toBe(6)
  })
})
