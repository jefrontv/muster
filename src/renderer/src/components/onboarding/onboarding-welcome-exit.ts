export const ONBOARDING_WELCOME_EXIT_MS = 560

export function resolveOnboardingWelcomeExitMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : ONBOARDING_WELCOME_EXIT_MS
}

export function splitOnboardingWelcomeTitle(title: string): string[] {
  return Array.from(title)
}
