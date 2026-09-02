// Wire types for `annotate_plan`: an agent opens a plan in Muster, a person marks it up, and the
// result comes back as the tool's return value.
//
// These live in shared/ because the same shapes cross three boundaries — the MCP process (over the
// site bridge), main, and the renderer (over IPC) — and a second definition would drift.

/** What the reviewer decided. Drives the agent's next move, so it is not inferred from the notes. */
export type PlanAnnotationDecision =
  /** Revise and come back. */
  | 'annotated'
  /** Proceed as written. */
  | 'approved'
  /** Proceed, with non-blocking guidance attached. */
  | 'approved_with_notes'
  /** Closed without feedback, or timed out. */
  | 'dismissed'

export type PlanAnnotationKind =
  | 'comment'
  | 'delete'
  | 'looks_good'
  /** Applies to the whole document; carries no quote or line range. */
  | 'global'

export type PlanAnnotation = {
  kind: PlanAnnotationKind
  /**
   * The exact text the note is attached to.
   *
   * Why this and not just lines: line numbers move the moment the plan is rewritten between
   * rounds, so the quote is the durable anchor and the range is a hint for rendering.
   */
  quote: string
  startLine: number
  endLine: number
  body: string
  /**
   * Absolute paths to images the reviewer attached.
   *
   * Paths rather than inline data: the agent can read a file, and a screenshot base64'd into a
   * tool result would swamp its context for no gain.
   */
  attachments?: string[]
}

export type PlanAnnotationEdits = {
  unifiedDiff: string
  /** True when the reviewer saved the edit to disk, so the agent must not re-apply it. */
  appliedToDisk: boolean
}

/** What the modal sends back, and — once `feedback` is rendered — what the tool returns. */
export type PlanAnnotationResult = {
  decision: PlanAnnotationDecision
  annotations: PlanAnnotation[]
  edits?: PlanAnnotationEdits
  /** Set when the decision was not the reviewer's, e.g. `timeout`. */
  reason?: string
}

/** Main → renderer. Carries content, never a path the renderer might not be able to read. */
export type PlanAnnotationRequest = {
  requestId: string
  /** Absent when the agent passed the plan inline rather than writing it to disk. */
  planPath: string | null
  title: string
  content: string
  /** The agent that asked for the review, from the MCP handshake. Null when it did not say. */
  agent: string | null
  /** The site or checkout the plan is about, so a review is not read out of context. */
  project: string | null
  /** 1 on first review of this plan, incrementing while the agent revises it. */
  round: number
  /** Previous round's content, so the modal can show what changed. Null on round 1. */
  previousContent: string | null
}
