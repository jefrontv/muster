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
  /** Only running once this review reaches the front — see startFront(). */
  timer: ReturnType<typeof setTimeout> | null
  openedAt: number
}

type Waiter = {
  resolve: (
    outcome:
      | { status: 'settled'; result: PlanAnnotationResult }
      | { status: 'pending'; openedMs: number }
  ) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * How long a verdict stays collectable after the person answers.
 *
 * Why keep it at all: the caller is polling, so the answer almost always lands between two polls
 * and has to be waiting when the next one arrives. Long enough to survive a retry or a
 * rate-limited agent, short enough that a forgotten review is not a permanent leak.
 */
export const PLAN_ANNOTATION_RESULT_RETENTION_MS = 900_000

/** Insertion-ordered, so the head is the review currently in front of the user. */
const queue = new Map<string, PendingReview>()

/** Answered reviews, kept for PLAN_ANNOTATION_RESULT_RETENTION_MS so a later poll can collect. */
const settled = new Map<
  string,
  { result: PlanAnnotationResult; timer: ReturnType<typeof setTimeout> }
>()

/** Polls currently parked on a review. More than one is normal: an agent may retry. */
const waiters = new Map<string, Set<Waiter>>()

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
  const requestId = entry.request.requestId
  queue.delete(requestId)
  notifyQueued()

  // Retained before the waiters are woken, so a poll that arrives in between still collects it.
  const expiry = setTimeout(() => settled.delete(requestId), PLAN_ANNOTATION_RESULT_RETENTION_MS)
  expiry.unref?.()
  settled.set(requestId, { result, timer: expiry })

  const parked = waiters.get(requestId)
  waiters.delete(requestId)
  for (const waiter of parked ?? []) {
    clearTimeout(waiter.timer)
    waiter.resolve({ status: 'settled', result })
  }

  try {
    sendResolved?.(requestId)
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

/**
 * Opens a review and returns at once.
 *
 * Why not a promise that resolves when the person answers: an MCP tool call is answered inside the
 * client's request timeout, and most harnesses cap that around 30 seconds. A review takes minutes,
 * so anything that blocks for its whole duration is dead on arrival. The caller gets an id and
 * collects the verdict with awaitPlanAnnotationResult, in waits it can size to its own ceiling.
 */
export function openPlanAnnotation(
  request: Omit<PlanAnnotationRequest, 'requestId'>
): { requestId: string } | { error: 'no-window' } {
  if (!sendRequest) {
    // No window is listening, and there is no headless way to ask a person.
    return { error: 'no-window' }
  }
  const requestId = randomUUID()
  queue.set(requestId, { request: { ...request, requestId }, timer: null, openedAt: Date.now() })
  startFront()
  // After startFront, so a review that went straight to the front reports a depth of zero.
  notifyQueued()
  return { requestId }
}

/**
 * Waits up to `timeoutMs` for a verdict.
 *
 * `pending` is a normal answer, not a failure: the caller polls again. `unknown` means the id was
 * never issued or its result has aged out, which is the caller's cue to stop rather than poll a
 * review that will never arrive.
 */
export function awaitPlanAnnotationResult(
  requestId: string,
  timeoutMs: number
): Promise<
  | { status: 'settled'; result: PlanAnnotationResult }
  | { status: 'pending'; openedMs: number }
  | { status: 'unknown' }
> {
  const done = settled.get(requestId)
  if (done) {
    return Promise.resolve({ status: 'settled' as const, result: done.result })
  }
  const entry = queue.get(requestId)
  if (!entry) {
    return Promise.resolve({ status: 'unknown' as const })
  }
  const openedAt = entry.openedAt
  const { promise, resolve } = Promise.withResolvers<
    { status: 'settled'; result: PlanAnnotationResult } | { status: 'pending'; openedMs: number }
  >()
  const waiter: Waiter = {
    resolve,
    timer: setTimeout(
      () => {
        waiters.get(requestId)?.delete(waiter)
        resolve({ status: 'pending', openedMs: Date.now() - openedAt })
      },
      Math.max(0, timeoutMs)
    )
  }
  waiter.timer.unref?.()
  const forId = waiters.get(requestId) ?? new Set<Waiter>()
  forId.add(waiter)
  waiters.set(requestId, forId)
  return promise
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

/** Test-only: dismiss and clear everything outstanding, including retained verdicts. */
export function clearPlanAnnotationsForTests(): void {
  // Deleting the current entry mid-iteration is safe for a Map iterator, so no copy is needed.
  for (const entry of queue.values()) {
    settle(entry, { decision: 'dismissed', annotations: [], reason: 'cleared' })
  }
  for (const done of settled.values()) {
    clearTimeout(done.timer)
  }
  settled.clear()
}
