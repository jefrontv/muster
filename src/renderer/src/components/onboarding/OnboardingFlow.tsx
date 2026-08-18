import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { isEditableTarget } from '@/lib/editable-target'
import { getScreenSubmitModifierLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { OnboardingState } from '../../../../shared/types'
import { AgentStep } from './AgentStep'
import { ThemeStep } from './ThemeStep'
import { NotificationStep } from './NotificationStep'
import { IntegrationsStep } from './IntegrationsStep'
import { WindowsTerminalStep } from './WindowsTerminalStep'
import { OnboardingDefaultViewStep } from './onboarding-default-view-step'
import { OnboardingWelcome } from './onboarding-welcome'
import { isOnboardingWelcomeReplayShortcut } from './onboarding-welcome-replay'
import { onboardingFinishCtaLabel } from './onboarding-finish-cta'
import { remapOpenOnboardingLastCompletedStep, useOnboardingFlow } from './use-onboarding-flow'
import { OnboardingSkipConfirmationDialog } from './OnboardingSkipConfirmationDialog'
import { OnboardingFooter } from './OnboardingFooter'
import { shouldRequestOnboardingSkipConfirmation } from './onboarding-dismiss-target'
import logo from '../../../../../resources/logo.svg'
import { translate } from '@/i18n/i18n'

const stepCopy = {
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

const stepTooltipLabels = {
  agent: 'Default Agent',
  theme: 'Appearance',
  default_view: 'Default View',
  windows_terminal: 'Windows Terminal',
  notifications: 'Notifications',
  integrations: 'Integrations'
} as const

type OnboardingFlowProps = {
  onboarding: OnboardingState
  onOnboardingChange: (state: OnboardingState) => void
  onSettingsDetourStart?: () => void
}

export default function OnboardingFlow({
  onboarding,
  onOnboardingChange,
  onSettingsDetourStart
}: OnboardingFlowProps): React.JSX.Element {
  const flow = useOnboardingFlow(onboarding, onOnboardingChange, { onSettingsDetourStart })
  const continueShortcutModifierLabel = getScreenSubmitModifierLabel()
  const { currentStep, stepIndex, busyLabel } = flow
  const copy = stepCopy[currentStep.id]
  const [welcomeVisible, setWelcomeVisible] = useState(
    () => remapOpenOnboardingLastCompletedStep(onboarding) <= 0
  )
  const [welcomeReplayKey, setWelcomeReplayKey] = useState(0)
  const dismissWelcome = useCallback(() => setWelcomeVisible(false), [])
  const replayWelcome = useCallback(() => {
    setWelcomeVisible(true)
    setWelcomeReplayKey((replay) => replay + 1)
  }, [])
  const shouldShowSkipToProjectSetup = !welcomeVisible && currentStep.id !== 'notifications'
  const shouldShowFooterBusy = Boolean(busyLabel)
  const footerPrimaryLabel =
    busyLabel ??
    (currentStep.id === 'notifications' ? onboardingFinishCtaLabel(flow.defaultView) : 'Continue')
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false)
  const skipConfirmAdvancedViaRef = useRef<'button' | 'keyboard'>('button')
  const { next: flowNext, dismissOnboarding: flowDismissOnboarding } = flow

  const requestSkipConfirmation = useCallback(
    (advancedVia: 'button' | 'keyboard') => {
      // Why: click-off / Escape dismissal stays available on every step,
      // including the final notifications step, so the modal never feels stuck.
      if (busyLabel || skipConfirmOpen) {
        return
      }
      skipConfirmAdvancedViaRef.current = advancedVia
      setSkipConfirmOpen(true)
    },
    [busyLabel, skipConfirmOpen]
  )

  const confirmSkipOnboarding = useCallback(() => {
    const advancedVia = skipConfirmAdvancedViaRef.current
    setSkipConfirmOpen(false)
    void flowDismissOnboarding(advancedVia)
  }, [flowDismissOnboarding])

  // Why: depend on stable callbacks + step id only so the listener doesn't
  // re-bind on every render of the parent (flow object identity changes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Why: don't hijack Enter / Cmd+Enter while the user is typing into the
      // clone-URL input or any other editable field on a step.
      if (isEditableTarget(event.target)) {
        return
      }
      // Why: onboarding continue is screen-local submit behavior, not a
      // user-configurable app command.
      if (!isScreenSubmitShortcut(event)) {
        return
      }
      if (welcomeVisible) {
        return
      }
      event.preventDefault()
      void flowNext('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [dismissWelcome, flowNext, welcomeVisible])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || skipConfirmOpen) {
        return
      }
      event.preventDefault()
      requestSkipConfirmation('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [requestSkipConfirmation, skipConfirmOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (skipConfirmOpen || isEditableTarget(event.target)) {
        return
      }
      if (!isOnboardingWelcomeReplayShortcut(event)) {
        return
      }
      event.preventDefault()
      replayWelcome()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [replayWelcome, skipConfirmOpen])

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/50 p-4 text-foreground backdrop-blur-[2px]"
        data-onboarding-overlay
        onPointerDown={(event) => {
          if (!shouldRequestOnboardingSkipConfirmation(event)) {
            return
          }
          requestSkipConfirmation('button')
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-8"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        <section
          ref={flow.setLifecycleRootRef}
          role="dialog"
          aria-label={translate(
            'auto.components.onboarding.OnboardingFlow.277ba45540',
            'Muster onboarding'
          )}
          aria-modal="true"
          data-onboarding-modal
          className={cn(
            'relative flex h-[calc(100vh-2rem)] max-h-[960px] min-h-0 w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-[max-width] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            'max-w-[1100px]'
          )}
        >
          <div className="relative flex h-full min-h-0 flex-col px-6 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-9">
            {welcomeVisible ? (
              <OnboardingWelcome key={welcomeReplayKey} onContinue={dismissWelcome} />
            ) : (
              <div className="onboarding-welcome-handoff flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-3 text-base font-semibold tracking-tight">
                  <img
                    src={logo}
                    alt=""
                    aria-hidden="true"
                    className="h-7 w-auto shrink-0 invert dark:invert-0"
                  />
                  <span>
                    {translate('auto.components.onboarding.OnboardingFlow.a249f81538', 'Muster')}
                  </span>
                </div>

                <div className="mt-10 flex items-center gap-2 transition-[margin-top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
                  {flow.progressSteps.map(({ step, index: realStepIndex }, progressIdx) => {
                    const isActive = realStepIndex === stepIndex
                    const isDone = realStepIndex < stepIndex
                    return (
                      <Tooltip key={step.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              // Why: the visible bars stay 4px tall, but the invisible
                              // hit area makes hover/click/tooltip targeting reliable.
                              'relative h-1 rounded-full outline-none transition-all duration-300 before:absolute before:-inset-y-2 before:-inset-x-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                              isActive
                                ? 'w-10 bg-foreground'
                                : isDone
                                  ? 'w-6 bg-muted-foreground/70 hover:bg-foreground/80'
                                  : 'w-6 bg-muted-foreground/25 hover:bg-muted-foreground/45'
                            )}
                            aria-label={translate(
                              'auto.components.onboarding.OnboardingFlow.adaa0aa627',
                              'Go to onboarding step {{value0}}: {{value1}}',
                              { value0: progressIdx + 1, value1: stepTooltipLabels[step.id] }
                            )}
                            aria-current={isActive ? 'step' : undefined}
                            onClick={() => flow.jumpToStep(realStepIndex)}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={8} style={{ zIndex: 110 }}>
                          {stepTooltipLabels[step.id]}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                  <span className="ml-3 text-xs font-medium text-muted-foreground">
                    {flow.progressStepIndex + 1}{' '}
                    {translate('auto.components.onboarding.OnboardingFlow.4db04f2f57', 'of')}{' '}
                    {flow.progressSteps.length}
                  </span>
                </div>

                <div className="mt-8 shrink-0">
                  {stepIndex === 0 && (
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {translate(
                        'auto.components.onboarding.OnboardingFlow.1b5e182e9f',
                        'Welcome to Muster'
                      )}
                    </div>
                  )}
                  <h1 className="text-[34px] font-semibold leading-[1.15] tracking-tight text-foreground">
                    {copy.title}
                  </h1>
                  {copy.subtitle ? (
                    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                      {copy.subtitle}
                    </p>
                  ) : null}
                </div>

                <div
                  className={cn(
                    'min-h-0 flex-1 transition-[margin-top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    // Why: agent step pins permissions below a capped agent grid scroll
                    // region; other steps keep the shared outer scroll container.
                    currentStep.id === 'agent'
                      ? 'mt-10 flex flex-col overflow-hidden'
                      : cn('scrollbar-sleek overflow-y-auto pr-1', 'mt-10')
                  )}
                >
                  {currentStep.id === 'agent' && (
                    <AgentStep
                      selectedAgent={flow.selectedAgent}
                      onSelect={flow.setSelectedAgent}
                      detectedSet={flow.detectedSet}
                      isDetecting={flow.isDetectingAgents}
                      yoloPermissions={flow.yoloPermissions}
                      onYoloPermissionsChange={flow.setYoloPermissions}
                    />
                  )}
                  {currentStep.id === 'theme' && (
                    <ThemeStep
                      theme={flow.theme}
                      onThemeChange={flow.setTheme}
                      settings={flow.settings}
                      updateSettings={flow.updateSettings}
                    />
                  )}
                  {currentStep.id === 'default_view' && (
                    <OnboardingDefaultViewStep
                      value={flow.defaultView}
                      onChange={flow.setDefaultView}
                    />
                  )}
                  {currentStep.id === 'notifications' && (
                    <NotificationStep
                      settings={flow.settings}
                      updateSettings={flow.updateSettings}
                    />
                  )}
                  {currentStep.id === 'integrations' && <IntegrationsStep />}
                  {currentStep.id === 'windows_terminal' && (
                    <WindowsTerminalStep
                      settings={flow.settings}
                      updateSettings={flow.updateSettings}
                    />
                  )}
                </div>

                <OnboardingFooter
                  shouldShowSkipToProjectSetup={shouldShowSkipToProjectSetup}
                  defaultView={flow.defaultView}
                  busyLabel={busyLabel}
                  onSkipToRepo={() => void flow.skipToRepo()}
                  stepIndex={stepIndex}
                  onBack={flow.back}
                  showPrimary
                  primaryBusy={shouldShowFooterBusy}
                  primaryLabel={footerPrimaryLabel}
                  shortcutModifierLabel={continueShortcutModifierLabel}
                  onPrimary={() => void flow.next()}
                  {...(currentStep.id === 'notifications'
                    ? {
                        secondaryLabel: translate(
                          'auto.components.onboarding.OnboardingFooter.done',
                          'Done'
                        ),
                        onSecondary: () => void flow.finishWithoutAdding()
                      }
                    : {})}
                />
              </div>
            )}
          </div>
        </section>
        <OnboardingSkipConfirmationDialog
          open={skipConfirmOpen}
          onOpenChange={setSkipConfirmOpen}
          onSkip={confirmSkipOnboarding}
        />
      </div>
    </TooltipProvider>
  )
}
