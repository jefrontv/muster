import { useCallback, useEffect, useRef, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { isEditableTarget } from '@/lib/editable-target'
import { getScreenSubmitModifierLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { translate } from '@/i18n/i18n'
import logo from '../../../../../resources/logo.svg'
import {
  resolveOnboardingWelcomeExitMs,
  splitOnboardingWelcomeTitle
} from './onboarding-welcome-exit'

type OnboardingWelcomeProps = {
  onContinue: () => void
}

export function OnboardingWelcome({ onContinue }: OnboardingWelcomeProps): React.JSX.Element {
  const shortcutModifierLabel = getScreenSubmitModifierLabel()
  const title = translate('auto.components.onboarding.OnboardingFlow.a249f81538', 'Muster')
  const [exiting, setExiting] = useState(false)
  const exitStartedRef = useRef(false)

  const requestExit = useCallback(() => {
    if (exitStartedRef.current) {
      return
    }
    exitStartedRef.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (resolveOnboardingWelcomeExitMs(reduced) === 0) {
      onContinue()
      return
    }
    setExiting(true)
  }, [onContinue])

  useEffect(() => {
    if (!exiting) {
      return
    }
    const timer = window.setTimeout(onContinue, resolveOnboardingWelcomeExitMs(false))
    return () => window.clearTimeout(timer)
  }, [exiting, onContinue])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || !isScreenSubmitShortcut(event)) {
        return
      }
      event.preventDefault()
      requestExit()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [requestExit])

  return (
    <div
      data-onboarding-welcome
      data-exiting={exiting ? 'true' : undefined}
      className="onboarding-welcome relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
    >
      <div aria-hidden className="onboarding-welcome-glow pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[40%] size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] blur-3xl" />
        <div className="onboarding-welcome-bloom absolute left-1/2 top-[44%] size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center text-center">
        <div className="onboarding-welcome-mark relative mb-9">
          <span
            aria-hidden
            className="onboarding-welcome-ring absolute inset-[-22px] rounded-[28%]"
          />
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="relative h-[5.5rem] w-[5.5rem] rounded-[22%] shadow-xs invert dark:invert-0"
          />
        </div>

        <p className="onboarding-welcome-kicker mb-4 text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
          {translate('auto.components.onboarding.welcome.eyebrow', 'Welcome to')}
        </p>
        <h1 className="flex items-baseline justify-center text-[56px] font-semibold leading-none tracking-[-0.03em] text-foreground">
          {splitOnboardingWelcomeTitle(title).map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className="onboarding-welcome-letter"
              style={{ ['--welcome-i' as string]: index }}
            >
              {letter === ' ' ? '\u00a0' : letter}
            </span>
          ))}
        </h1>
        <span aria-hidden className="onboarding-welcome-rule mt-5 h-px w-16 bg-border" />
        <p className="onboarding-welcome-tagline mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.onboarding.welcome.tagline',
            'Your agents, projects, and work — one quiet desk.'
          )}
        </p>
      </div>

      <div className="onboarding-welcome-cta mt-11">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={exiting}
          aria-busy={exiting}
          onClick={requestExit}
        >
          {translate('auto.components.onboarding.welcome.start', 'Get started')}
          <span className="ml-1 inline-flex items-center gap-0.5 rounded border border-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-medium leading-none text-current/80">
            <span>{shortcutModifierLabel}</span>
            <CornerDownLeft className="size-3" />
          </span>
        </button>
      </div>
    </div>
  )
}
