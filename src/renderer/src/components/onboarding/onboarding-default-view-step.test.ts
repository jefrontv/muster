import { describe, expect, it, vi } from 'vitest'
import {
  applyOnboardingDefaultView,
  availableOnboardingDefaultViews,
  resolveOnboardingDefaultView
} from './onboarding-default-view-step'

const mocks = vi.hoisted(() => ({
  activeView: 'terminal' as string,
  openChatPage: vi.fn(),
  closeChatPage: vi.fn(),
  openBotsPage: vi.fn(),
  setActiveView: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      activeView: mocks.activeView,
      openChatPage: mocks.openChatPage,
      closeChatPage: mocks.closeChatPage,
      openBotsPage: mocks.openBotsPage,
      setActiveView: mocks.setActiveView
    })
  }
}))

describe('onboarding default view', () => {
  it('keeps chat and bots as their own views and maps the rest to code', () => {
    expect(resolveOnboardingDefaultView('chat')).toBe('chat')
    expect(resolveOnboardingDefaultView('bots')).toBe('bots')
    expect(resolveOnboardingDefaultView('terminal')).toBe('code')
    expect(resolveOnboardingDefaultView(undefined)).toBe('code')
  })

  it('opens chat page for Chat Mode and restores code for Code Mode', () => {
    applyOnboardingDefaultView('chat')
    expect(mocks.openChatPage).toHaveBeenCalledTimes(1)

    mocks.activeView = 'chat'
    applyOnboardingDefaultView('code')
    expect(mocks.closeChatPage).toHaveBeenCalledTimes(1)

    mocks.activeView = 'terminal'
    applyOnboardingDefaultView('code')
    expect(mocks.setActiveView).toHaveBeenCalledWith('terminal')
  })

  it('opens the Bots page for Bots mode', () => {
    applyOnboardingDefaultView('bots')
    expect(mocks.openBotsPage).toHaveBeenCalledTimes(1)
  })

  it('offers Bots only when it is switched on', () => {
    expect(availableOnboardingDefaultViews(false)).not.toContain('bots')
    expect(availableOnboardingDefaultViews(undefined)).not.toContain('bots')
    expect(availableOnboardingDefaultViews(true)).toContain('bots')
    expect(availableOnboardingDefaultViews(true)).toContain('code')
  })
})
