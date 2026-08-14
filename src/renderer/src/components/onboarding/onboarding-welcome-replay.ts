export function isOnboardingWelcomeReplayShortcut(event: KeyboardEvent): boolean {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !event.shiftKey) {
    return false
  }
  return event.key === 'G' || event.key === 'g'
}
