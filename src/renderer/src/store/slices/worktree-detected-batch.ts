// One batched `worktrees:listDetectedBatch` round trip for a bulk refresh, exposed as per-repo promises.
import type { DetectedWorktreeListResult } from '../../../../shared/types'

type Deferred = {
  promise: Promise<DetectedWorktreeListResult>
  resolve: (result: DetectedWorktreeListResult) => void
  reject: (error: unknown) => void
}

function createDeferred(): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<DetectedWorktreeListResult>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Why: a repo dropped from the refresh mid-flight never awaits its promise.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** Null when the preload has no batch API (web client, older preload); callers list per repo. */
export function startDetectedWorktreeBatch(
  repoIds: readonly string[]
): Map<string, Promise<DetectedWorktreeListResult>> | null {
  const listDetectedBatch = window.api?.worktrees?.listDetectedBatch
  if (typeof listDetectedBatch !== 'function' || repoIds.length === 0) {
    return null
  }
  const deferreds = new Map<string, Deferred>()
  for (const repoId of repoIds) {
    if (!deferreds.has(repoId)) {
      deferreds.set(repoId, createDeferred())
    }
  }
  const settle = (result: DetectedWorktreeListResult): void => {
    deferreds.get(result.repoId)?.resolve(result)
  }
  listDetectedBatch({ repoIds: [...deferreds.keys()] }, settle).then(
    (results) => {
      for (const result of results) {
        settle(result)
      }
      // Non-authoritative so a repo main skipped can never trigger a purge.
      for (const [repoId, deferred] of deferreds) {
        deferred.resolve({
          repoId,
          authoritative: false,
          source: 'metadata-fallback',
          worktrees: []
        })
      }
    },
    (error: unknown) => {
      for (const deferred of deferreds.values()) {
        deferred.reject(error)
      }
    }
  )
  return new Map([...deferreds].map(([repoId, deferred]) => [repoId, deferred.promise]))
}
