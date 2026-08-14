import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_WELCOME_EXIT_MS,
  resolveOnboardingWelcomeExitMs,
  splitOnboardingWelcomeTitle
} from './onboarding-welcome-exit'

describe('onboarding welcome exit', () => {
  it('holds a fade when motion is allowed and skips it when reduced', () => {
    expect(resolveOnboardingWelcomeExitMs(false)).toBe(ONBOARDING_WELCOME_EXIT_MS)
    expect(resolveOnboardingWelcomeExitMs(true)).toBe(0)
    expect(ONBOARDING_WELCOME_EXIT_MS).toBeGreaterThan(300)
  })

  it('splits the title into characters so the cascade can replay', () => {
    expect(splitOnboardingWelcomeTitle('Muster')).toEqual(['M', 'u', 's', 't', 'e', 'r'])
  })
})
