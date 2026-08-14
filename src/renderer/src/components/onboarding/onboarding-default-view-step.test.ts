import { describe, expect, it, vi } from 'vitest'
import {
  applyOnboardingDefaultView,
  resolveOnboardingDefaultView
} from './onboarding-default-view-step'

const mocks = vi.hoisted(() => ({
  activeView: 'terminal' as string,
  openChatPage: vi.fn(),
  closeChatPage: vi.fn(),
  setActiveView: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      activeView: mocks.activeView,
      openChatPage: mocks.openChatPage,
      closeChatPage: mocks.closeChatPage,
      setActiveView: mocks.setActiveView
    })
  }
}))

describe('onboarding default view', () => {
  it('treats chat as the only chat-mode view', () => {
    expect(resolveOnboardingDefaultView('chat')).toBe('chat')
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
})
