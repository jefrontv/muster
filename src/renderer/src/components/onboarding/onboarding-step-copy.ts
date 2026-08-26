// Title and subtitle for each onboarding page, kept out of OnboardingFlow so the
// component file stays about flow and layout.
//
// Getters, not plain strings: translate() has to run at render time or a
// language switch would leave the wizard on the locale it was first mounted in.

import { translate } from '@/i18n/i18n'
import type { StepId } from './use-onboarding-flow-types'

type OnboardingStepCopy = { readonly title: string; readonly subtitle: string }

export const stepCopy: Record<StepId, OnboardingStepCopy> = {
  agent: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.198b148b3c',
        'Pick your default agent'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.322fc50a18',
        "Muster works with every CLI agent. Choose the one you'll reach for most. Switch any time."
      )
    }
  },
  site_sources: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.siteSourcesTitle',
        'Point Muster at your sites'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.siteSourcesSubtitle',
        'Pick the folders your sites live in. Muster watches them and can add new ones to the sidebar for you.'
      )
    }
  },
  site_mcp: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.siteMcpTitle',
        'Let agents work on your sites'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.siteMcpSubtitle',
        'Install the muster-sites server into your harnesses so agents can deploy, import, and query databases.'
      )
    }
  },
  theme: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.f396db9f20',
        'Make it feel like home'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.04ae28d8ca',
        'Pick the look you want to stare at for hours.'
      )
    }
  },
  default_view: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.defaultViewTitle',
        'How do you want to start?'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.defaultViewSubtitle',
        'Chat is a conversation desk. Code is worktrees and terminals. Switch any time from the sidebar.'
      )
    }
  },
  notifications: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.b054332836',
        'Set up notifications'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ff92d15436',
        'Muster will notify you when agents are done or need help.'
      )
    }
  },
  integrations: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.integrationsTitle',
        'Connect your sources'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.integrationsSubtitle',
        'Link GitHub, Bitbucket, and ActiveCollab to:'
      )
    }
  },
  windows_terminal: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalTitle',
        'Set Windows terminal defaults'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalSubtitle',
        'Choose the default shell for new panes, and how right-click behaves.'
      )
    }
  }
} as const

// Record, not `as const`: a step added without a label is then a type error
// rather than a blank stepper tooltip.
export const stepTooltipLabels: Record<StepId, string> = {
  agent: 'Default Agent',
  theme: 'Appearance',
  default_view: 'Default View',
  windows_terminal: 'Windows Terminal',
  notifications: 'Notifications',
  integrations: 'Integrations',
  site_sources: 'Site Folders',
  site_mcp: 'Site Tools'
}
