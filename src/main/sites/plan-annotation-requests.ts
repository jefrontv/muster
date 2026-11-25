// Pending `annotate_plan` reviews, and the queue that keeps them from colliding.
//
// Ported from chat-connector-confirm.ts, with one addition it does not need: reviews queue. Two
// agents each spawn their own `--site-mcp` process, so two can arrive at one GUI at once, and a
// concurrent tool (see SiteMcpTool.concurrent) lets a single agent do it too. Dropping or replacing
// the open one would silently lose a review a person had already started writing, so requests wait
// their turn instead.

import { randomUUID } from 'node:crypto'
import type {
  PlanAnnotationOpenInput,
  PlanAnnotationRequest,
  PlanAnnotationResult,
  PlanReviewPageRef
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
  /** When it reached the front and was sent to a window; null while queued behind another. */
  shownAt: number | null
}

/** A review still open: how long since it was sent, and whether it has reached the screen. */
export type PlanAnnotationPending = {
  status: 'pending'
  openedMs: number
  /** Null while queued behind another review. */
  shownMs: number | null
  queuedAhead: number
}

type Waiter = {
  resolve: (
    outcome: { status: 'settled'; result: PlanAnnotationResult } | PlanAnnotationPending
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

/**
 * Rounds, prior text and the Pages page, keyed by reviewKey().
 *
 * Why here and not in a transport: the MCP tool and the agent-hooks routes both review plans, and
 * one owner keeps the modal's round counter and "changed since last round" diff identical on
 * either path.
 *
 * Why a limit: this used to live in the MCP process, which died with its agent. The GUI does not,
 * so the memo is bounded and evicts the plan opened longest ago.
 */
const roundsByPlanPath = new Map<
  string,
  { round: number; content: string; page: PlanReviewPageRef | null }
>()

/** Plenty for any one working session; a bound, not a policy. */
const PLAN_ROUND_MEMORY_LIMIT = 64

function rememberRound(
  planPath: string,
  memo: { round: number; content: string; page: PlanReviewPageRef | null }
): void {
  // Re-insert so insertion order stays "least recently opened first".
  roundsByPlanPath.delete(planPath)
  roundsByPlanPath.set(planPath, memo)
  while (roundsByPlanPath.size > PLAN_ROUND_MEMORY_LIMIT) {
    const oldest = roundsByPlanPath.keys().next().value
    if (oldest === undefined) {
      break
    }
    roundsByPlanPath.delete(oldest)
  }
}

/** Saves the plan to a Pages page and names it; null leaves the review off Pages. */
export type PlanReviewPageBinder = (
  input: PlanAnnotationOpenInput,
  prior: PlanReviewPageRef | null,
  options?: { force?: boolean }
) => PlanReviewPageRef | null

let bindPage: PlanReviewPageBinder | null = null

export function setPlanAnnotationPageBinder(binder: PlanReviewPageBinder | null): void {
  bindPage = binder
}

/** Same plan, next round: same page, plan file, or inline title from the same agent. */
function reviewKey(input: PlanAnnotationOpenInput): string {
  if (input.page) {
    return `page:${input.page.scopeKey}:${input.page.pageId}`
  }
  return input.planPath ?? `inline:${input.agent ?? ''}:${input.title}`
}

function pageFor(
  input: PlanAnnotationOpenInput,
  prior: PlanReviewPageRef | null,
  options?: { force?: boolean }
) {
  if (!bindPage) {
    return input.page ?? null
  }
  try {
    return bindPage(input, prior, options)
  } catch (error) {
    // A Pages failure must not cost the review; it falls back to the plan-review tab.
    console.warn('[plan-review] could not save the plan to Pages:', error)
    return null
  }
}

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
  entry.shownAt = Date.now()
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
 *
 * Round counting happens here for the same reason the queue exists: several transports review the
 * same plans, and a caller cannot be the authority on how many times this plan has been seen.
 * `queuedAhead` is the number of reviews that settle before this one — what a progress line shows.
 */
export function openPlanAnnotation(
  input: PlanAnnotationOpenInput
):
  | { requestId: string; round: number; queuedAhead: number; pageId?: string }
  | { error: 'no-window' } {
  if (!sendRequest) {
    // No window is listening, and there is no headless way to ask a person.
    return { error: 'no-window' }
  }
  const key = reviewKey(input)
  const prior = roundsByPlanPath.get(key)
  const round = input.round ?? (prior ? prior.round + 1 : 1)
  const previousContent = input.previousContent ?? prior?.content ?? null
  const page = pageFor(input, prior?.page ?? null)
  rememberRound(key, { round, content: input.content, page })
  const requestId = randomUUID()
  // Everything already queued settles first (FIFO), so the current depth is what is ahead of us.
  const queuedAhead = queue.size
  const openedAt = Date.now()
  const request: PlanAnnotationRequest = {
    ...input,
    page,
    pageIsSource: Boolean(page && input.page),
    openedAt,
    requestId,
    round,
    previousContent
  }
  queue.set(requestId, { request, timer: null, openedAt, shownAt: null })
  startFront()
  // After startFront, so a review that went straight to the front reports a depth of zero.
  notifyQueued()
  return { requestId, round, queuedAhead, ...(page ? { pageId: page.pageId } : {}) }
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
  | PlanAnnotationPending
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
  const { promise, resolve } = Promise.withResolvers<
    { status: 'settled'; result: PlanAnnotationResult } | PlanAnnotationPending
  >()
  const waiter: Waiter = {
    resolve,
    timer: setTimeout(
      () => {
        waiters.get(requestId)?.delete(waiter)
        resolve(pendingFor(requestId, entry))
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

function pendingFor(requestId: string, entry: PendingReview): PlanAnnotationPending {
  const now = Date.now()
  return {
    status: 'pending',
    openedMs: now - entry.openedAt,
    shownMs: entry.shownAt === null ? null : now - entry.shownAt,
    queuedAhead: Math.max(0, [...queue.keys()].indexOf(requestId))
  }
}

export function respondPlanAnnotation(requestId: string, result: PlanAnnotationResult): boolean {
  const entry = queue.get(requestId)
  if (!entry) {
    // Already settled — a double submit, or a response racing the timeout.
    return false
  }
  const page = entry.request.page
  settle(entry, page ? { ...result, pageId: page.pageId } : result)
  startFront()
  return true
}

/**
 * "Add to Pages": saves an open path/content review as a page and resends it, so the window moves
 * the review onto that page. Later rounds of the plan keep updating the same page.
 */
export function savePlanAnnotationToPages(
  requestId: string,
  pagesFolder: string | null
): PlanReviewPageRef | null {
  const entry = queue.get(requestId)
  if (!entry || entry.request.page) {
    return entry?.request.page ?? null
  }
  const key = reviewKey(entry.request)
  const page = pageFor({ ...entry.request, pagesFolder }, null, { force: true })
  if (!page) {
    return null
  }
  entry.request = { ...entry.request, page, pageIsSource: false }
  const memo = roundsByPlanPath.get(key)
  if (memo) {
    rememberRound(key, { ...memo, page })
  }
  if (head() === entry) {
    try {
      sendRequest?.(entry.request)
    } catch {
      // The page is saved either way; a reopened window lists the review with its page.
    }
  }
  return page
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

/** Test-only: forget round history so cases do not leak into each other. */
export function clearPlanRoundsForTests(): void {
  roundsByPlanPath.clear()
}
