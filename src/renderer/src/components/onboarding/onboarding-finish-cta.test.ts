import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openChatPage: vi.fn(),
  closeChatPage: vi.fn(),
  setActiveView: vi.fn(),
  setChatWorkspaceCreateOpen: vi.fn(),
  openModal: vi.fn(),
  openSitesPage: vi.fn(),
  setNewSiteDialogOpen: vi.fn(),
  activeView: 'terminal' as string
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      activeView: mocks.activeView,
      openChatPage: mocks.openChatPage,
      closeChatPage: mocks.closeChatPage,
      setActiveView: mocks.setActiveView,
      setChatWorkspaceCreateOpen: mocks.setChatWorkspaceCreateOpen,
      openModal: mocks.openModal,
      openSitesPage: mocks.openSitesPage,
      setNewSiteDialogOpen: mocks.setNewSiteDialogOpen
    })
  }
}))

import {
  onboardingFinishBusyLabel,
  onboardingFinishCtaLabel,
  openOnboardingFinishSurface
} from './onboarding-finish-cta'

describe('onboarding finish CTA', () => {
  it('asks Chat Mode users to add a workspace and Code Mode users to set up a site', () => {
    expect(onboardingFinishCtaLabel('chat')).toBe('Add first workspace')
    expect(onboardingFinishCtaLabel('code')).toBe('Set up your first site')
    expect(onboardingFinishBusyLabel('chat')).toBe('Opening Add Workspace...')
    expect(onboardingFinishBusyLabel('code')).toBe('Opening New site...')
  })

  it('opens the Chat workspace dialog for Chat Mode and New site for Code Mode', () => {
    openOnboardingFinishSurface('chat')
    expect(mocks.openChatPage).toHaveBeenCalled()
    expect(mocks.setChatWorkspaceCreateOpen).toHaveBeenCalledWith(true)
    expect(mocks.openModal).not.toHaveBeenCalled()

    mocks.openChatPage.mockClear()
    mocks.setChatWorkspaceCreateOpen.mockClear()
    openOnboardingFinishSurface('code')
    expect(mocks.openSitesPage).toHaveBeenCalled()
    expect(mocks.setNewSiteDialogOpen).toHaveBeenCalledWith(true)
    expect(mocks.openModal).not.toHaveBeenCalled()
    expect(mocks.setChatWorkspaceCreateOpen).not.toHaveBeenCalled()
  })
})
