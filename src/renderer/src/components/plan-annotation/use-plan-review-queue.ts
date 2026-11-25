// The queue of reviews waiting for this window.
//
// Reviews queue rather than collide: two agents each spawn their own MCP process, and annotate_plan
// runs off the server's dispatch chain, so more than one can arrive at once. Replacing the open one
// would silently discard a review someone had already started writing.
//
// Module state, not component state: the popup host and the plan review tab both read the front
// review, and only the host (mounted once in App) subscribes to IPC.

import { useEffect, useSyncExternalStore } from 'react'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import { rememberFocusBeforeReview } from './plan-review-focus-return'

type QueueState = {
  queue: PlanAnnotationRequest[]
  /**
   * Reviews stacked behind the front one, as reported by main.
   *
   * Why not `queue.length - 1`: main only ever sends the front review, because it owns the queue
   * and each review's timer, so this window holds at most one.
   */
  queued: number
}

let state: QueueState = { queue: [], queued: 0 }
const listeners = new Set<() => void>()

function update(next: (previous: QueueState) => QueueState): void {
  state = next(state)
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function popPlanReview(requestId: string): void {
  update((s) => ({ ...s, queue: s.queue.filter((entry) => entry.requestId !== requestId) }))
}

export function usePlanReviewFront(): { current: PlanAnnotationRequest | null; waiting: number } {
  const current = useSyncExternalStore(subscribe, () => state.queue[0] ?? null)
  const waiting = useSyncExternalStore(subscribe, () => state.queued)
  return { current, waiting }
}

/** Subscribes this window to main's review queue. Mount once. */
export function usePlanReviewQueueSubscription(): void {
  useEffect(
    () => window.api.planAnnotation.onQueued((count) => update((s) => ({ ...s, queued: count }))),
    []
  )

  useEffect(
    () =>
      window.api.planAnnotation.onRequest((request) => {
        rememberFocusBeforeReview()
        // A resent review (moved to Pages) replaces its entry rather than queueing twice.
        update((s) =>
          s.queue.some((entry) => entry.requestId === request.requestId)
            ? {
                ...s,
                queue: s.queue.map((entry) =>
                  entry.requestId === request.requestId ? request : entry
                )
              }
            : { ...s, queue: [...s.queue, request] }
        )
      }),
    []
  )

  // Why: a review can settle without this window answering it — a timeout, or another window
  // submitting first. Left in the queue it shows a review that looks live but answers nothing.
  useEffect(() => window.api.planAnnotation.onResolved((requestId) => popPlanReview(requestId)), [])

  // Why: a review can be queued before this window existed, and without this the agent waits out
  // the whole timeout for a review nobody ever saw.
  useEffect(() => {
    void window.api.planAnnotation
      .listPending()
      .then((pending) => {
        if (pending.length > 0) {
          rememberFocusBeforeReview()
        }
        update((s) => ({
          queue: [
            ...s.queue,
            ...pending.filter((p) => !s.queue.some((entry) => entry.requestId === p.requestId))
          ],
          // Seeds the depth for a window that opened mid-backlog; main only pushes it on change.
          queued: Math.max(0, pending.length - 1)
        }))
      })
      .catch(() => undefined)
  }, [])
}

/** Test seam: resets module state between tests. */
export function resetPlanReviewQueueForTests(): void {
  state = { queue: [], queued: 0 }
}
