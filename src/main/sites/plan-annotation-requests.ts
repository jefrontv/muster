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

/** Production wiring broadcasts to every BrowserWindow; tests inject a spy. */
export function setPlanAnnotationSender(
  sender: ((request: PlanAnnotationRequest) => void) | null
): void {
  sendRequest = sender
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
  entry.resolve(result)
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
