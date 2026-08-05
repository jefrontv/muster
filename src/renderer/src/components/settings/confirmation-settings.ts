// The confirmation flags, minus the rendering.
//
// Split from the section component so "which prompts are suppressed" and "what does Reset all
// write" are testable without mounting React, and so the reset payload has exactly one definition.

import type { GlobalSettings } from '../../../../shared/types'

/** Every confirmation restored to its shipped default. */
export const ALL_CONFIRMATIONS_ENABLED = {
  skipDeleteWorktreeConfirm: false,
  skipCloseTerminalWithRunningProcessConfirm: false,
  skipDeleteAutomationConfirm: false,
  skipCodexRateLimitResetConfirm: false,
  confirmClosePinnedTab: true
} as const satisfies Partial<GlobalSettings>

type ConfirmationSettings = Pick<GlobalSettings, keyof typeof ALL_CONFIRMATIONS_ENABLED>

export function hasSuppressedConfirmation(settings: ConfirmationSettings): boolean {
  return (
    settings.skipDeleteWorktreeConfirm ||
    settings.skipCloseTerminalWithRunningProcessConfirm ||
    settings.skipDeleteAutomationConfirm ||
    settings.skipCodexRateLimitResetConfirm ||
    // Why the fallback: this one is a positive flag and predates the section, so an older profile
    // reads as undefined and must count as "confirmation on".
    (settings.confirmClosePinnedTab ?? true) === false
  )
}
