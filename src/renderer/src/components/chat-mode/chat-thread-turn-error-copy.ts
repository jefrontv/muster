// Plain copy for the failure codes the CLI reports as a result subtype. The raw
// text stays available behind Details; it is never the headline.

import { translate } from '@/i18n/i18n'

export type ChatThreadTurnErrorCopy = {
  summary: string
  /** Raw CLI text, shown only behind a Details disclosure; null when it adds nothing. */
  details: string | null
}

function knownSubtypeSummary(raw: string): string | null {
  switch (raw) {
    case 'error_max_turns':
      return translate(
        'components.chat-mode.turnError.maxTurns',
        'Claude hit its step limit for this reply.'
      )
    case 'error_during_execution':
      return translate(
        'components.chat-mode.turnError.duringExecution',
        'Something went wrong while running.'
      )
    case 'error_max_budget_usd':
      return translate(
        'components.chat-mode.turnError.maxBudget',
        'This reply reached its spending limit.'
      )
    default:
      return null
  }
}

export function chatThreadTurnErrorCopy(raw: string): ChatThreadTurnErrorCopy {
  const trimmed = raw.trim()
  const known = knownSubtypeSummary(trimmed)
  if (known) {
    return { summary: known, details: trimmed }
  }
  return {
    summary: translate('components.chat-mode.turnError.title', "That didn't finish"),
    details: trimmed === '' ? null : trimmed
  }
}
