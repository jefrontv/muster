// Coalesces per-repo worktree store writes from a bulk refresh into one set() per animation frame.
import type { AppState } from '../types'

export type WorktreeStateReducer = (s: AppState) => AppState | Partial<AppState>

type SetAppState = (reducer: (s: AppState) => AppState | Partial<AppState>) => void

export type WorktreeCommitBatcher = {
  commit: (reducer: WorktreeStateReducer) => void
  /** Apply everything queued now. Bulk callers must call this before reading the result. */
  flush: () => void
}

// Why: rAF is paused while the window is hidden; the timeout keeps commits flowing there.
const HIDDEN_WINDOW_FLUSH_FALLBACK_MS = 100

export type ScheduleFlush = (flush: () => void) => () => void

const scheduleNextFrame: ScheduleFlush = (flush) => {
  let done = false
  const run = (): void => {
    if (!done) {
      done = true
      flush()
    }
  }
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : null
  const timer = setTimeout(run, frame === null ? 0 : HIDDEN_WINDOW_FLUSH_FALLBACK_MS)
  return () => {
    done = true
    if (frame !== null) {
      cancelAnimationFrame(frame)
    }
    clearTimeout(timer)
  }
}

export function createWorktreeCommitBatcher(
  set: SetAppState,
  schedule: ScheduleFlush = scheduleNextFrame
): WorktreeCommitBatcher {
  let queue: WorktreeStateReducer[] = []
  let cancelScheduled: (() => void) | null = null

  const flush = (): void => {
    cancelScheduled?.()
    cancelScheduled = null
    if (queue.length === 0) {
      return
    }
    const pending = queue
    queue = []
    set((s) => {
      let next = s
      for (const reducer of pending) {
        try {
          const partial = reducer(next)
          if (partial !== next) {
            next = { ...next, ...partial }
          }
        } catch (err) {
          console.error('[worktrees] batched worktree commit failed:', err)
        }
      }
      if (next === s) {
        return s
      }
      // Why: sortEpoch re-sorts the sidebar; one bump per commit however many repos changed.
      return next.sortEpoch === s.sortEpoch ? next : { ...next, sortEpoch: s.sortEpoch + 1 }
    })
  }

  return {
    commit: (reducer) => {
      queue.push(reducer)
      cancelScheduled ??= schedule(flush)
    },
    flush
  }
}
