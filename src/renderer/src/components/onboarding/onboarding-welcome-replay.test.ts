import { describe, expect, it } from 'vitest'
import { isOnboardingWelcomeReplayShortcut } from './onboarding-welcome-replay'

function key(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'G',
    ...partial
  } as KeyboardEvent
}

describe('isOnboardingWelcomeReplayShortcut', () => {
  it('matches Shift+G and ignores other chords', () => {
    expect(isOnboardingWelcomeReplayShortcut(key({}))).toBe(true)
    expect(isOnboardingWelcomeReplayShortcut(key({ key: 'g' }))).toBe(true)
    expect(isOnboardingWelcomeReplayShortcut(key({ shiftKey: false }))).toBe(false)
    expect(isOnboardingWelcomeReplayShortcut(key({ metaKey: true }))).toBe(false)
    expect(isOnboardingWelcomeReplayShortcut(key({ ctrlKey: true }))).toBe(false)
    expect(isOnboardingWelcomeReplayShortcut(key({ key: 'Enter' }))).toBe(false)
    expect(isOnboardingWelcomeReplayShortcut(key({ repeat: true }))).toBe(false)
  })
})
