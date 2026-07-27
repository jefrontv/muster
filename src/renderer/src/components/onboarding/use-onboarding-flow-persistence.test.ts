// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/telemetry', () => ({
  track: trackMock
}))

import {
  buildCompletedOnboardingNotificationSettings,
  buildOnboardingDismissedPayload,
  trackOnboardingDismissed
} from './use-onboarding-flow-persistence'

describe('onboarding flow persistence', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('builds dismissed telemetry with the triggering advance path', () => {
    expect(
      buildOnboardingDismissedPayload(3, {
        durationMs: 250,
        advancedVia: 'keyboard'
      })
    ).toEqual({
      last_step: 3,
      duration_ms: 250,
      advanced_via: 'keyboard'
    })
  })

  it('tracks dismissed onboarding telemetry with the triggering advance path', () => {
    trackOnboardingDismissed(3, {
      durationMs: 250,
      advancedVia: 'keyboard'
    })

    expect(trackMock).toHaveBeenCalledWith('onboarding_dismissed', {
      last_step: 3,
      duration_ms: 250,
      advanced_via: 'keyboard'
    })
  })

  it('preserves explicit focus notification suppression when completing onboarding', () => {
    const notifications = buildCompletedOnboardingNotificationSettings({
      enabled: false,
      agentTaskComplete: false,
      siteRunComplete: false,
      terminalBell: false,
      activeCollabAssigned: false,
      activeCollabComments: false,
      activeCollabDue: false,
      activeCollabUpdated: false,
      suppressWhenFocused: false,
      customSoundId: 'two-tone',
      customSoundPath: null,
      customSoundVolume: 60
    })

    // Exhaustive on purpose: it catches a new notification default silently reaching completed
    // onboarding. siteRunComplete is the ocsites import/deploy notification, off by default, and the
    // four activeCollab* kinds must stay off — finishing onboarding cannot start polling a work
    // server nobody has connected.
    expect(notifications).toEqual({
      enabled: true,
      agentTaskComplete: true,
      siteRunComplete: false,
      terminalBell: true,
      activeCollabAssigned: false,
      activeCollabComments: false,
      activeCollabDue: false,
      activeCollabUpdated: false,
      suppressWhenFocused: false,
      customSoundId: 'two-tone',
      customSoundPath: null,
      customSoundVolume: 60
    })
  })
})
