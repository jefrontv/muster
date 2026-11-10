import { describe, expect, it, vi } from 'vitest'
import {
  applyOnboardingDefaultView,
  availableOnboardingDefaultViews,
  initialOnboardingDefaultView,
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

  it('offers Bots in place of Chat when Bots is switched on', () => {
    expect(availableOnboardingDefaultViews(true)).toEqual(['bots', 'code'])
  })

  it('preselects Bots on a first run and keeps a view already open', () => {
    expect(initialOnboardingDefaultView(['bots', 'code'], 'terminal')).toBe('bots')
    expect(initialOnboardingDefaultView(['bots', 'code'], 'bots')).toBe('bots')
    expect(initialOnboardingDefaultView(['bots', 'code'], 'chat')).toBe('bots')
    expect(initialOnboardingDefaultView(['chat', 'code'], 'terminal')).toBe('code')
    expect(initialOnboardingDefaultView(['chat', 'code'], 'chat')).toBe('chat')
  })

  it('falls back to Chat and Code when Bots is off', () => {
    expect(availableOnboardingDefaultViews(false)).toEqual(['chat', 'code'])
    expect(availableOnboardingDefaultViews(undefined)).toEqual(['chat', 'code'])
  })
})
