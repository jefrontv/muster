import { useAppStore } from '@/store'
import type { OnboardingDefaultView } from './onboarding-default-view-step'
import { applyOnboardingDefaultView } from './onboarding-default-view-step'

export function onboardingFinishCtaLabel(defaultView: OnboardingDefaultView): string {
  return defaultView === 'chat' ? 'Add first workspace' : 'Add your first project'
}

export function onboardingFinishBusyLabel(defaultView: OnboardingDefaultView): string {
  return defaultView === 'chat' ? 'Opening Add Workspace...' : 'Opening Add Project...'
}

export function openOnboardingFinishSurface(defaultView: OnboardingDefaultView): void {
  if (defaultView === 'chat') {
    applyOnboardingDefaultView('chat')
    useAppStore.getState().setChatWorkspaceCreateOpen?.(true)
    return
  }
  useAppStore.getState().openModal('add-repo')
}
