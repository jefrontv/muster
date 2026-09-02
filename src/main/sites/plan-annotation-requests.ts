// Pending `annotate_plan` reviews, and the queue that keeps them from colliding.
//
// Ported from chat-connector-confirm.ts, with one addition it does not need: reviews queue. Two
// agents each spawn their own `--site-mcp` process, so two can arrive at one GUI at once, and a
// concurrent tool (see SiteMcpTool.concurrent) lets a single agent do it too. Dropping or replacing
// the open one would silently lose a review a person had already started writing, so requests wait
// their turn instead.

import { randomUUID } from 'node:crypto'
import type {
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../shared/plan-annotation-types'

/**
 * Long enough for a real plan review, short of holding an agent forever.
 *
 * Why a ceiling at all: a modal left open would pin the calling agent AND everything queued behind
 * it, so the failure mode of no timeout is worse than a premature dismissal.
 */
export const PLAN_ANNOTATION_TIMEOUT_MS = 1_800_000

type PendingReview = {
  request: PlanAnnotationRequest
  resolve: (result: PlanAnnotationResult) => void
  /** Only running once this review reaches the front — see startFront(). */
  timer: ReturnType<typeof setTimeout> | null
}

/** Insertion-ordered, so the head is the review currently in front of the user. */
const queue = new Map<string, PendingReview>()

let sendRequest: ((request: PlanAnnotationRequest) => void) | null = null
let sendResolved: ((requestId: string) => void) | null = null
let sendQueued: ((count: number) => void) | null = null

/** Production wiring broadcasts to every BrowserWindow; tests inject a spy. */
export function setPlanAnnotationSender(
  sender: ((request: PlanAnnotationRequest) => void) | null
): void {
  sendRequest = sender
}

/**
 * Announces that a review is no longer answerable.
 *
 * Why every window needs this: a review can settle without the window showing it being the one that
 * answered — a timeout, or a second window submitting first. Without the announcement that window
 * keeps a dead modal on screen, and answering it silently does nothing.
 */
export function setPlanAnnotationResolvedSender(
  sender: ((requestId: string) => void) | null
): void {
  sendResolved = sender
}

/**
 * Announces how many reviews are stacked behind the one on screen.
 *
 * Why a separate signal: only the front review is ever sent to a window, because main owns the
 * queue and the per-review timers. That left the renderer counting a list it only ever had one
 * entry of, so its "more waiting" indicator could never fire and a reviewer working through a
 * backlog had no way to know more was coming.
 */
export function setPlanAnnotationQueuedSender(sender: ((count: number) => void) | null): void {
  sendQueued = sender
}

function notifyQueued(): void {
  try {
    sendQueued?.(Math.max(0, queue.size - 1))
  } catch {
    // A destroyed window mid-broadcast must not stop a review arriving or settling.
  }
}

function head(): PendingReview | null {
  for (const entry of queue.values()) {
    return entry
  }
  return null
}

function settle(entry: PendingReview, result: PlanAnnotationResult): void {
  if (entry.timer) {
    clearTimeout(entry.timer)
  }
  queue.delete(entry.request.requestId)
  notifyQueued()
  entry.resolve(result)
  try {
    sendResolved?.(entry.request.requestId)
  } catch {
    // A destroyed window mid-broadcast must not stop the review from resolving.
  }
}

/**
 * Shows the front review and starts its clock.
 *
 * Why the timer starts here rather than on arrival: a plan queued behind a slow review would
 * otherwise burn its whole budget waiting, and time out having never been seen.
 */
function startFront(): void {
  const entry = head()
  if (!entry || entry.timer) {
    return
  }
  entry.timer = setTimeout(() => {
    settle(entry, { decision: 'dismissed', annotations: [], reason: 'timeout' })
    startFront()
  }, PLAN_ANNOTATION_TIMEOUT_MS)
  entry.timer.unref?.()
  try {
    sendRequest?.(entry.request)
  } catch {
    // A destroyed window mid-send falls through to the timeout dismissal.
  }
}

export function requestPlanAnnotation(
  request: Omit<PlanAnnotationRequest, 'requestId'>
): Promise<PlanAnnotationResult> {
  if (!sendRequest) {
    // No window is listening, and there is no headless way to ask a person.
    return Promise.resolve({
      decision: 'dismissed',
      annotations: [],
      reason: 'no-window'
    })
  }
  const requestId = randomUUID()
  return new Promise<PlanAnnotationResult>((resolve) => {
    queue.set(requestId, {
      request: { ...request, requestId },
      resolve,
      timer: null
    })
    startFront()
    // After startFront, so a review that went straight to the front reports a depth of zero.
    notifyQueued()
  })
}

export function respondPlanAnnotation(requestId: string, result: PlanAnnotationResult): boolean {
  const entry = queue.get(requestId)
  if (!entry) {
    // Already settled — a double submit, or a response racing the timeout.
    return false
  }
  settle(entry, result)
  startFront()
  return true
}

/** Every review still waiting, front first. Lets a reopened window rebuild its queue. */
export function listPendingPlanAnnotations(): PlanAnnotationRequest[] {
  return [...queue.values()].map((entry) => entry.request)
}

/** Test-only: dismiss and clear everything outstanding. */
export function clearPlanAnnotationsForTests(): void {
  // Deleting the current entry mid-iteration is safe for a Map iterator, so no copy is needed.
  for (const entry of queue.values()) {
    settle(entry, { decision: 'dismissed', annotations: [], reason: 'cleared' })
  }
}
