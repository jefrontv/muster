// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/telemetry', () => ({
  track: trackMock
}))

import { renderHook } from '@testing-library/react'
import {
  buildCompletedOnboardingNotificationSettings,
  buildOnboardingDismissedPayload,
  trackOnboardingDismissed,
  usePersistCurrentStep
} from './use-onboarding-flow-persistence'
import { getDefaultOnboardingState } from '../../../../shared/constants'
import { STEPS } from './use-onboarding-flow-types'

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
      customSoundVolume: 60,
      activeCollabSoundId: 'global',
      activeCollabSoundPath: null,
      activeCollabStyle: 'detailed'
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
      customSoundVolume: 60,
      activeCollabSoundId: 'global',
      activeCollabSoundPath: null,
      activeCollabStyle: 'detailed'
    })
  })

  // Why: a step id this hook does not handle returns { ok: false }, which makes
  // next() refuse to advance with no error on screen — Continue just dies.
  // site_mcp shipped that way once already.
  it.each(STEPS.map((step) => step.id))(
    'persists the %s step so Continue can advance',
    async (stepId) => {
      const onboarding = getDefaultOnboardingState()
      const onOnboardingChange = vi.fn()
      // Only the fields this hook actually reads; getDefaultSettings() needs
      // environment the renderer test has no business standing up.
      const settings = {
        agentDefaultArgs: {},
        agentDefaultEnv: {},
        notifications: {},
        theme: 'dark'
      } as unknown as Parameters<typeof usePersistCurrentStep>[0]['settings']
      Object.assign(window, {
        api: { onboarding: { update: vi.fn().mockResolvedValue(onboarding) } }
      })

      const { result } = renderHook(() =>
        usePersistCurrentStep({
          currentStepId: stepId,
          selectedAgent: 'claude',
          yoloPermissions: false,
          theme: 'dark',
          defaultView: 'code',
          settings,
          updateSettings: vi.fn(),
          onboardingChecklist: onboarding.checklist,
          onOnboardingChange,
          setError: vi.fn()
        })
      )

      await expect(result.current()).resolves.toEqual({ ok: true })
      expect(onOnboardingChange).toHaveBeenCalled()
    }
  )
})
