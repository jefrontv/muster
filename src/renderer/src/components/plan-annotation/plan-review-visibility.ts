// Whether a placed plan review is in front of the user, so one placed elsewhere gets announced.
import { useSyncExternalStore } from 'react'

export function planReviewOnScreen(args: {
  dialog: boolean
  worktreeId: string | null
  activeView: string
  activeWorktreeId: string | null
  windowFocused: boolean
}): boolean {
  if (!args.windowFocused) {
    return false
  }
  if (args.dialog) {
    return true
  }
  // Chat, Bots, Sites and the other full-page views cover the project tabs.
  return args.activeView === 'terminal' && args.activeWorktreeId === args.worktreeId
}

function subscribeWindowFocus(listener: () => void): () => void {
  window.addEventListener('focus', listener)
  window.addEventListener('blur', listener)
  document.addEventListener('visibilitychange', listener)
  return () => {
    window.removeEventListener('focus', listener)
    window.removeEventListener('blur', listener)
    document.removeEventListener('visibilitychange', listener)
  }
}

function windowFocusedNow(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

export function useWindowFocused(): boolean {
  return useSyncExternalStore(subscribeWindowFocus, windowFocusedNow)
}

/** A placed review shows a tab marked for review; without one the placement silently failed. */
export function worktreeShowsPlanReview(
  tabsByWorktree: Record<string, readonly { attention?: string | null }[]> | undefined,
  worktreeId: string
): boolean {
  return (tabsByWorktree?.[worktreeId] ?? []).some((tab) => tab.attention === 'review')
}
