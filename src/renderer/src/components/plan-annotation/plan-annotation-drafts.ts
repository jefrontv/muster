// Draft notes and edits survive a reload or a crash mid-review.
//
// Why this matters more here than for a normal form: the agent's tool call is parked on the other
// side of this modal. Losing the notes does not just lose typing — it means the review the user
// already did comes back as "no feedback", and they have no way to tell the agent otherwise.
//
// localStorage rather than the store: drafts are per-window scratch, must survive a renderer
// reload, and must never be serialized into the app's own persisted state.

import type { DraftNote } from './plan-annotation-notes'

const KEY_PREFIX = 'muster.plan-annotation.draft.'

export type PlanReviewEdits = {
  /** The plan as the agent sent it; edits are only restored onto the same text. */
  source: string
  /** The editor's serialization of `source`, so normalisation is never reported as an edit. */
  baseline: string
  content: string
}

export type PlanReviewDraft = {
  notes: DraftNote[]
  edits: PlanReviewEdits | null
}

/**
 * Keyed by plan path when there is one, so a review reopened in a later round recovers its notes;
 * an inline plan falls back to the request id, which lives only as long as the call does.
 */
export function draftKey(args: { planPath: string | null; requestId: string }): string {
  return `${KEY_PREFIX}${args.planPath ?? args.requestId}`
}

export function loadDraft(key: string, source: string): PlanReviewDraft {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return { notes: [], edits: null }
    }
    const parsed: unknown = JSON.parse(raw)
    // Drafts written before edits were persisted are a bare note list.
    if (Array.isArray(parsed)) {
      return { notes: parsed as DraftNote[], edits: null }
    }
    const draft = parsed as Partial<PlanReviewDraft> | null
    const edits = draft?.edits ?? null
    return {
      notes: Array.isArray(draft?.notes) ? draft.notes : [],
      edits: edits && edits.source === source ? edits : null
    }
  } catch {
    // Corrupt or unavailable storage must never block a review from opening.
    return { notes: [], edits: null }
  }
}

export function saveDraft(key: string, draft: PlanReviewDraft): void {
  try {
    if (draft.notes.length === 0 && draft.edits === null) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(draft))
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
