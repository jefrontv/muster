// A muster:// link the user opens while an SSH password card waits goes to that card, not to the
// usual bind modal. Held here, in main, until the card uses it or settles.

import type { SiteSetupClipboardLink } from '../../shared/site-setup-approval-types'
import { readClipboardLink, summarizeLink, type ClipboardLink } from './site-setup-clipboard-link'

const heldLinks = new Map<string, ClipboardLink>()

/**
 * Hands an opened link to the front waiting SSH card. Returns that card's id, or null when no card
 * waits or the link carries no password, so the usual bind modal handles it.
 */
export function holdOpenedLinkForCard(
  url: string,
  waitingSshRequestIds: readonly string[]
): string | null {
  const requestId = waitingSshRequestIds[0]
  const link = requestId ? readClipboardLink(url) : null
  if (!requestId || !link) {
    return null
  }
  // A newer link replaces an older one, so at most one password is held per card.
  heldLinks.set(requestId, link)
  return requestId
}

/** The opened link first, since the user chose it on purpose; otherwise the clipboard's. */
export function linkForCard(requestId: string, clipboardText: string): ClipboardLink | null {
  return heldLinks.get(requestId) ?? readClipboardLink(clipboardText)
}

export function linkSummaryForCard(
  requestId: string,
  clipboardText: string
): SiteSetupClipboardLink | null {
  const held = heldLinks.get(requestId)
  if (held) {
    return summarizeLink(held, 'opened')
  }
  const copied = readClipboardLink(clipboardText)
  return copied ? summarizeLink(copied, 'clipboard') : null
}

export function dropHeldLink(requestId: string): void {
  heldLinks.delete(requestId)
}
