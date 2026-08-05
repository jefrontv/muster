import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { ALL_CONFIRMATIONS_ENABLED, hasSuppressedConfirmation } from './confirmation-settings'

const defaults = getDefaultSettings('/home/tester')

describe('hasSuppressedConfirmation', () => {
  it('is false for a profile that has never turned one off', () => {
    expect(hasSuppressedConfirmation(defaults)).toBe(false)
  })

  it('notices each skip flag on its own', () => {
    for (const key of [
      'skipDeleteWorktreeConfirm',
      'skipCloseTerminalWithRunningProcessConfirm',
      'skipDeleteAutomationConfirm',
      'skipCodexRateLimitResetConfirm'
    ] as const) {
      expect(hasSuppressedConfirmation({ ...defaults, [key]: true }), key).toBe(true)
    }
  })

  it('reads the pinned-tab flag with the opposite polarity', () => {
    expect(hasSuppressedConfirmation({ ...defaults, confirmClosePinnedTab: false })).toBe(true)
    expect(hasSuppressedConfirmation({ ...defaults, confirmClosePinnedTab: true })).toBe(false)
  })
})

describe('ALL_CONFIRMATIONS_ENABLED', () => {
  it('clears every suppression it is applied to', () => {
    const suppressed = {
      ...defaults,
      skipDeleteWorktreeConfirm: true,
      skipCloseTerminalWithRunningProcessConfirm: true,
      skipDeleteAutomationConfirm: true,
      skipCodexRateLimitResetConfirm: true,
      confirmClosePinnedTab: false
    }

    expect(hasSuppressedConfirmation({ ...suppressed, ...ALL_CONFIRMATIONS_ENABLED })).toBe(false)
  })

  it('matches the shipped defaults, so Reset all cannot drift from a fresh profile', () => {
    for (const [key, value] of Object.entries(ALL_CONFIRMATIONS_ENABLED)) {
      expect(defaults[key as keyof typeof defaults], key).toBe(value)
    }
  })
})
