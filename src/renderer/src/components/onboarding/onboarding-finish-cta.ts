import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { OnboardingDefaultView } from './onboarding-default-view-step'
import { applyOnboardingDefaultView } from './onboarding-default-view-step'

// Code mode finishes on a site, not a project: Muster users come to work on WordPress sites, and
// "Add project" opened a dialog unrelated to the Sites page they had just set up folders for.
export function onboardingFinishCtaLabel(defaultView: OnboardingDefaultView): string {
  return defaultView === 'chat'
    ? 'Add first workspace'
    : translate('auto.components.onboarding.finish.firstSite', 'Set up your first site')
}

export function onboardingFinishBusyLabel(defaultView: OnboardingDefaultView): string {
  return defaultView === 'chat'
    ? 'Opening Add Workspace...'
    : translate('auto.components.onboarding.finish.openingNewSite', 'Opening New site...')
}

export function openOnboardingFinishSurface(defaultView: OnboardingDefaultView): void {
  if (defaultView === 'chat') {
    applyOnboardingDefaultView('chat')
    useAppStore.getState().setChatWorkspaceCreateOpen?.(true)
    return
  }
  const state = useAppStore.getState()
  state.openSitesPage()
  state.setNewSiteDialogOpen(true)
}

/** The secondary finish in Code mode, for a folder or repository that is not a site. */
export function openOnboardingProjectSurface(): void {
  useAppStore.getState().openModal('add-repo')
}
