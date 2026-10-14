// The agent-hooks face of the plan-review queue.
//
// Why a second door into the same room: OMP/PI give every MCP request a fixed deadline (30 s
// unless the harness config raises it), so collecting a verdict over MCP degrades into polling.
// The extension shipping in those harnesses calls these routes instead and parks in-process, where
// no such deadline exists. It opens the same queue, so the reviewer sees one modal either way.

import { awaitPlanAnnotationResult, openPlanAnnotation } from './plan-annotation-requests'
import { formatPlanFeedback } from './plan-review-feedback'
import {
  describePlanProject,
  loadPlanText,
  PlanSourceError,
  type PlanProjectSite
} from './plan-review-source'

/** The site lookup a review header needs; structurally satisfied by the app store. */
export type PlanReviewHookStore = { listSites: () => readonly PlanProjectSite[] }

/**
 * Cap on one collect.
 *
 * Why a cap and not "wait as long as it takes": `HOOK_REQUEST_SLOWLORIS_MS` destroys a socket that
 * stays idle for five seconds, so a caller wanting a long wait loops this call instead. The loop
 * costs no model turn, and a dropped socket would cost an error.
 */
export const PLAN_REVIEW_MAX_WAIT_MS = 2_000

/** The review header is a dialog line, and the value is whatever the extension claimed. */
const MAX_AGENT_LABEL = 60

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

/** Every text field is optional on the wire, so "absent" has one spelling: the empty string. */
function readTextField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  return typeof value === 'string' ? value : ''
}

export type PlanReviewOpenArgs = {
  /** Null before the store is up or when it failed to load; the header then shows no project. */
  store: PlanReviewHookStore | null
  body: unknown
}

/**
 * Opens a review for an extension and answers at once with its id.
 *
 * Domain failures are `ok: false` rather than HTTP statuses: the caller is a tool that has to
 * phrase the problem to its model, and "no window is open" is not a transport error.
 */
export function handlePlanReviewOpen(args: PlanReviewOpenArgs): unknown {
  const body = asRecord(args.body)
  if (!body) {
    return { ok: false, error: 'bad-request' }
  }
  const cwd = readTextField(body, 'cwd')
  let plan: { planPath: string | null; title: string; content: string }
  try {
    plan = loadPlanText({
      path: readTextField(body, 'path'),
      content: readTextField(body, 'content'),
      cwd
    })
  } catch (error) {
    return { ok: false, error: error instanceof PlanSourceError ? error.code : 'bad-request' }
  }
  if (plan.content.length === 0) {
    // An empty file is not a plan; the modal would show a blank page and ask for a verdict on it.
    return { ok: false, error: 'bad-request' }
  }
  const opened = openPlanAnnotation({
    planPath: plan.planPath,
    title: plan.title,
    content: plan.content,
    agent: readTextField(body, 'agent').slice(0, MAX_AGENT_LABEL) || null,
    project: cwd.length > 0 ? describePlanProject(cwd, args.store?.listSites() ?? []) : null
  })
  if ('error' in opened) {
    return { ok: false, error: 'no-window' }
  }
  return {
    ok: true,
    review_id: opened.requestId,
    round: opened.round,
    queued_ahead: opened.queuedAhead
  }
}

/** Parks for one bounded wait, then reports what is true: still reading, settled, or gone. */
export async function handlePlanReviewCollect(args: { body: unknown }): Promise<unknown> {
  const body = asRecord(args.body)
  const reviewId = body ? readTextField(body, 'review_id') : ''
  if (reviewId.length === 0) {
    return { ok: false, error: 'bad-request' }
  }
  const requested = body?.wait_ms
  const waitMs =
    typeof requested === 'number' && Number.isFinite(requested)
      ? Math.min(Math.max(0, requested), PLAN_REVIEW_MAX_WAIT_MS)
      : 0
  const outcome = await awaitPlanAnnotationResult(reviewId, waitMs)
  if (outcome.status === 'unknown') {
    return { ok: false, error: 'unknown' }
  }
  if (outcome.status === 'pending') {
    return { ok: true, status: 'pending', open_for_seconds: Math.round(outcome.openedMs / 1_000) }
  }
  const result = outcome.result
  return {
    ok: true,
    status: 'settled',
    decision: result.decision,
    feedback: formatPlanFeedback(result),
    annotations: result.annotations,
    ...(result.edits ? { edits: result.edits } : {}),
    ...(result.reason ? { reason: result.reason } : {})
  }
}
