import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultOnboardingState, getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import OnboardingFlow from './OnboardingFlow'
import { ONBOARDING_SKIP_CONFIRMATION_COPY } from './OnboardingSkipConfirmationDialog'

function renderOnboardingFlow(props: ComponentProps<typeof OnboardingFlow>): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <OnboardingFlow {...props} />
    </TooltipProvider>
  )
}

describe('OnboardingFlow', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({
      repos: [],
      settings: getDefaultSettings('/tmp')
    })
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
  })

  afterEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.unstubAllGlobals()
  })

  it('does not render the removed agent setup or tour steps', () => {
    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 6
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Set up notifications')
    expect(html).not.toContain('Set up Muster for agents')
    expect(html).not.toContain('Explore Muster')
    expect(html).not.toContain('Take the tour')
    expect(html).toContain('Add your first project')
    expect(html).toContain('Done')
    expect(html).not.toContain('Point Muster at some code')
  })

  it.each([
    // Why welcome: pre-default_view progress restarts on the new first step.
    [3, 'data-onboarding-welcome="true"'],
    [4, 'data-onboarding-welcome="true"'],
    // Finishing integrations in the old flow means site_mcp is what comes next.
    [5, 'Let agents work on your sites'],
    [9, 'Let agents work on your sites']
  ])(
    'resumes unversioned seven-step onboarding progress %i at the matching current page',
    (legacyStep, title) => {
      const html = renderOnboardingFlow({
        onboarding: {
          ...getDefaultOnboardingState(),
          flowVersion: 1,
          lastCompletedStep: legacyStep
        },
        onOnboardingChange: vi.fn()
      })

      expect(html).toContain(title)
      expect(html).not.toContain('Set up Muster for agents')
      expect(html).not.toContain('Explore Muster')
    }
  )

  it.each([
    [3, 'data-onboarding-welcome="true"'],
    [4, 'Let agents work on your sites'],
    [5, 'Let agents work on your sites'],
    [9, 'Let agents work on your sites']
  ])(
    'resumes versioned five-step onboarding progress %i at the matching current page',
    (legacyStep, title) => {
      const html = renderOnboardingFlow({
        onboarding: {
          ...getDefaultOnboardingState(),
          flowVersion: 2,
          lastCompletedStep: legacyStep
        },
        onOnboardingChange: vi.fn()
      })

      expect(html).toContain(title)
      expect(html).not.toContain('Set up Muster for agents')
      expect(html).not.toContain('Explore Muster')
    }
  )

  it.each([
    // Finishing v3 integrations lands on site_mcp; later progress clears it.
    [3, 'Let agents work on your sites'],
    [4, 'Set up notifications'],
    [9, 'Set up notifications']
  ])(
    'resumes versioned four-step onboarding progress %i without showing Windows setup on Mac',
    (legacyStep, title) => {
      const html = renderOnboardingFlow({
        onboarding: {
          ...getDefaultOnboardingState(),
          flowVersion: 3,
          lastCompletedStep: legacyStep
        },
        onOnboardingChange: vi.fn()
      })

      expect(html).toContain(title)
      expect(html).not.toContain('Set Windows terminal defaults')
    }
  )

  it('shows the Windows terminal defaults page for Windows users after site tools', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows' })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 5
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Set Windows terminal defaults')
    expect(html).toContain('6 of 7')
  })

  it('drops the skipped integrations step from the stepper on Windows', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows' })
    useAppStore.setState({
      preflightStatus: {
        git: { installed: true },
        gh: { installed: true, authenticated: false },
        bitbucket: { configured: true, authenticated: true, account: 'team' },
        ocsites: { detected: false }
      },
      preflightStatusChecked: true,
      activeCollabStatus: { configured: true, connection: null, reason: '' }
    })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 5
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Set Windows terminal defaults')
    // Why: integrations is skipped (gh already installed), so it is not a
    // stepper dot at all — the six real steps are default view, agent, theme,
    // site tools, Windows terminal, notifications, and Windows terminal is
    // the fifth of six.
    expect(html).toContain('5 of 6')
    expect(html).not.toContain('Connect your sources')
    expect(html).not.toContain('Integrations')
  })

  it('offers the site tools step to Code mode users after integrations', () => {
    useAppStore.setState({ activeView: 'terminal' })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 4
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Let agents work on your sites')
    expect(html).toContain('5 of 6')
  })

  it('skips the site tools step entirely for Chat mode users', () => {
    // Deploys, imports and database queries are Code-mode work; a Chat user has
    // nothing to point them at, so the step is not even a stepper dot.
    useAppStore.setState({ activeView: 'chat' })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 4
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).not.toContain('Let agents work on your sites')
    expect(html).not.toContain('muster-sites')
    expect(html).toContain('Set up notifications')
  })

  it('skips GitHub task setup when the GitHub CLI is already detected', () => {
    useAppStore.setState({
      preflightStatus: {
        git: { installed: true },
        gh: { installed: true, authenticated: false },
        bitbucket: { configured: true, authenticated: true, account: 'team' },
        ocsites: { detected: false }
      },
      preflightStatusChecked: true,
      activeCollabStatus: { configured: true, connection: null, reason: '' }
    })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 5
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Set up notifications')
    expect(html).toContain('Add your first project')
    expect(html).toContain('Done')
    expect(html).not.toContain('Connect your sources')
    expect(html).not.toContain('Connect your task sources')
    expect(html).not.toContain('Point Muster at some code')
    // Why: with both integrations (gh installed) and Windows terminal (Mac)
    // skipped, the stepper shows only the five real steps — no dead dots.
    expect(html).toContain('5 of 5')
    expect(html).not.toContain('Integrations')
  })

  it('asks Chat Mode users to add a first workspace on the last step', () => {
    useAppStore.setState({ activeView: 'chat' })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 5
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Set up notifications')
    expect(html).toContain('Add first workspace')
    expect(html).toContain('Done')
    expect(html).not.toContain('Add your first project')
  })

  it('shows only GitHub on the task setup page when the GitHub CLI is missing', () => {
    useAppStore.setState({
      preflightStatus: {
        git: { installed: true },
        gh: { installed: false, authenticated: false }
      },
      preflightStatusChecked: true
    })

    const html = renderOnboardingFlow({
      onboarding: {
        ...getDefaultOnboardingState(),
        lastCompletedStep: 3
      },
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('Connect your sources')
    expect(html).toContain('Link GitHub, Bitbucket, and ActiveCollab to:')
    expect(html).toContain('GitHub')
    expect(html).toContain('ActiveCollab')
    expect(html).not.toContain('Linear')
    expect(html).not.toContain('Jira')
    expect(html).not.toContain('More task sources')
    expect(html).not.toContain('GitLab, Azure DevOps, Gitea, and ActiveCollab live in Settings')
  })

  it('renders onboarding inside a centered modal shell', () => {
    const html = renderOnboardingFlow({
      onboarding: getDefaultOnboardingState(),
      onOnboardingChange: vi.fn()
    })

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-onboarding-modal="true"')
    expect(html).toContain('h-[calc(100vh-2rem)]')
    expect(html).toContain('rounded-xl')
    expect(html).toContain('data-onboarding-welcome="true"')
    expect(html).toContain('Get started')
    expect(html).not.toContain('min-h-screen')
    expect(html).not.toContain('background-color:#12181e')
  })

  it('renders concise skip confirmation copy', () => {
    expect(ONBOARDING_SKIP_CONFIRMATION_COPY).toEqual({
      title: 'Skip onboarding?',
      description: "You can set all of this up later in Settings, but this screen won't come back.",
      skipLabel: 'Skip',
      keepGoingLabel: 'No, keep going'
    })
  })
})
