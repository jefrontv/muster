// Draft notes survive a reload or a crash mid-review.
//
// Why this matters more here than for a normal form: the agent's tool call is parked on the other
// side of this modal. Losing the notes does not just lose typing — it means the review the user
// already did comes back as "no feedback", and they have no way to tell the agent otherwise.
//
// localStorage rather than the store: drafts are per-window scratch, must survive a renderer
// reload, and must never be serialized into the app's own persisted state.

import type { DraftNote } from './plan-annotation-notes'

const KEY_PREFIX = 'muster.plan-annotation.draft.'

/**
 * Keyed by plan path when there is one, so a review reopened in a later round recovers its notes;
 * an inline plan falls back to the request id, which lives only as long as the call does.
 */
export function draftKey(args: { planPath: string | null; requestId: string }): string {
  return `${KEY_PREFIX}${args.planPath ?? args.requestId}`
}

export function loadDraft(key: string): DraftNote[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DraftNote[]) : []
  } catch {
    // Corrupt or unavailable storage must never block a review from opening.
    return []
  }
}

export function saveDraft(key: string, notes: readonly DraftNote[]): void {
  try {
    if (notes.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(notes))
  } catch {
    /* quota or privacy mode — the review still works, it just cannot be recovered */
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}
