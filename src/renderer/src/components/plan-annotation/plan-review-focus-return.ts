// Where keyboard focus goes back to once the last queued plan review closes.
//
// Why: Radix's modal dialog hands focus to its trigger on close, and an agent-opened review has no
// trigger, so focus fell to <body> and typing went nowhere until the user clicked the terminal.

import { useAppStore } from '@/store'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'

let focusBeforeReview: HTMLElement | null = null

function isReviewOpen(): boolean {
  return document.querySelector('[data-plan-review-dialog]') !== null
}

/** Records the focused element as a review arrives, unless another review already holds focus. */
export function rememberFocusBeforeReview(): void {
  if (isReviewOpen()) {
    return
  }
  // Why: a review landing just before the previous one's restore sees <body>; keep the earlier target.
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body) {
    focusBeforeReview = active
  }
}

/** Called from the dialog's close-autofocus; a no-op while another queued review is showing. */
export function restoreFocusAfterReview(): void {
  if (isReviewOpen()) {
    return
  }
  const target = focusBeforeReview
  focusBeforeReview = null
  if (target?.isConnected) {
    target.focus({ preventScroll: true })
    if (document.activeElement === target) {
      return
    }
  }
  const state = useAppStore.getState()
  if (state.activeTabType === 'terminal' && state.activeTabId) {
    focusTerminalTabSurface(state.activeTabId, null, { onlyIfFocusUnclaimed: true })
  }
}
