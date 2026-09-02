// The queue of reviews waiting for this window.
//
// Reviews queue rather than collide: two agents each spawn their own MCP process, and annotate_plan
// runs off the server's dispatch chain, so more than one can arrive at once. Replacing the open one
// would silently discard a review someone had already started writing.

import { useCallback, useEffect, useState } from 'react'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'

export function usePlanReviewQueue(): {
  current: PlanAnnotationRequest | null
  /** Reviews behind the current one, so the header can say more is coming. */
  waiting: number
  popCurrent: () => void
} {
  const [queue, setQueue] = useState<PlanAnnotationRequest[]>([])

  useEffect(
    () => window.api.planAnnotation.onRequest((request) => setQueue((q) => [...q, request])),
    []
  )

  // Why: a review can settle without this window answering it — a timeout, or another window
  // submitting first. Left in the queue it shows a modal that looks live but answers nothing.
  useEffect(
    () =>
      window.api.planAnnotation.onResolved((requestId) =>
        setQueue((q) => q.filter((entry) => entry.requestId !== requestId))
      ),
    []
  )

  // Why: a review can be queued before this window existed, and without this the agent waits out
  // the whole timeout for a modal nobody ever saw.
  useEffect(() => {
    void window.api.planAnnotation
      .listPending()
      .then((pending) =>
        setQueue((q) => [
          ...q,
          ...pending.filter((p) => !q.some((entry) => entry.requestId === p.requestId))
        ])
      )
      .catch(() => undefined)
  }, [])

  const popCurrent = useCallback(() => setQueue((q) => q.slice(1)), [])

  return { current: queue[0] ?? null, waiting: Math.max(0, queue.length - 1), popCurrent }
}
