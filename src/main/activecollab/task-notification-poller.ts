// The loop that turns ActiveCollab's lack of an incremental API into notifications.
//
// Poll cadence is THREE MINUTES, fixed. One poll is one request per page of open assigned tasks —
// one page for anyone holding under 100 — so three minutes costs 20 requests an hour per user who
// opted in. Even if every one of the 176 people on the target instance switched it on, that is
// about one request a second against their own work server, and realistic adoption is a fraction of
// that. In the other direction, three minutes is well inside the human latency of "somebody
// commented on your task": a tighter loop buys a couple of minutes of freshness for a linear cost
// on a server nobody here owns, and a looser one stops being a notification.
//
// The first poll waits 15 seconds so it neither competes with app startup nor turns a restart loop
// into a burst of requests.
//
// Rules that are this module's alone, because they are not diffs:
//   - NEVER DIFF A FAILED FETCH. A network fault leaves the snapshot untouched and emits nothing;
//     diffing an empty result would report every task as gone and then re-announce all of them on
//     recovery. Consecutive failures back off to a 15-minute ceiling and reset on the first success.
//   - NEVER DIFF A PARTIAL FETCH either. An incomplete set is not a smaller set — the rows it
//     missed read as "gone" now and "newly assigned" next time — so paging is all-or-nothing.
//   - Poll only while ActiveCollab is connected AND `shouldPoll` says something can surface the
//     result. A user who never connected is never polled on ActiveCollab's behalf, and one who
//     switched off every banner AND hid the Tasks button is not polled to feed a badge they cannot
//     see (see acShouldPollAcTasks in task-notification-service.ts).
//   - The snapshot is re-read from disk on every poll, never cached here: local writes fold
//     themselves into that file (task-snapshot-store.ts), and a cached copy would miss the fold and
//     notify the user about their own edit. The unread counts are re-read for the same reason —
//     marking a task read writes that file from outside this loop.
//
// ONE DIFF FEEDS BOTH SURFACES. The banners and the unread counts come from the same
// `acDiffTaskSnapshot` call, so they cannot disagree, and a count costs no extra request.
//
// Kind filtering happens at EMIT, never at the snapshot and never at the counts: a change the user
// does not want a BANNER for still has to advance the snapshot, or it is reported the moment they
// enable that toggle — and it still has to reach the badge, which those toggles do not govern.

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabTask, ActiveCollabTaskPage } from '../../shared/activecollab-types'
import {
  acDiffTaskSnapshot,
  type AcTaskChange,
  type AcTaskChangeKind,
  type AcTaskSnapshot
} from './task-change-detector'
import { acMergeTaskUnread, type AcTaskUnread } from './task-unread'

export const AC_POLL_INTERVAL_MS = 3 * 60_000
export const AC_POLL_START_DELAY_MS = 15_000
export const AC_POLL_MAX_BACKOFF_MS = 15 * 60_000

/** 1000 tasks. Past this the fetch is treated as incomplete rather than silently truncated. */
export const AC_POLL_MAX_PAGES = 10

export type AcTaskPollerDeps = {
  now: () => number
  /** The connected credential's snapshot key, or null when ActiveCollab is not connected. */
  snapshotKey: () => string | null
  /** Whether anything can surface a result. False means do not poll at all. */
  shouldPoll: () => boolean
  /** The kinds the user asked for a BANNER about. Empty still polls: the badge is not gated. */
  notifyKinds: () => ReadonlySet<AcTaskChangeKind>
  fetchPage: (page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>
  loadSnapshot: (key: string) => AcTaskSnapshot | null
  saveSnapshot: (key: string, snapshot: AcTaskSnapshot) => void
  loadUnread: (key: string) => AcTaskUnread
  saveUnread: (key: string, unread: AcTaskUnread) => void
  emit: (change: AcTaskChange) => void
  /** Told only when the counts actually moved, so an idle poll wakes no renderer. */
  onUnread: (unread: AcTaskUnread) => void
  /** Schedules `run` once, and answers with its cancel. Injected so tests own the clock. */
  schedule: (delayMs: number, run: () => void) => () => void
}

export type AcTaskPoller = {
  /** Idempotent: starting a running poller is a no-op, not a second timer. */
  start: () => void
  stop: () => void
  /** Start or stop to match the current credential and settings. */
  refresh: () => void
  /** One poll, awaited. The timer loop and the tests both go through here. */
  poll: () => Promise<void>
}

/**
 * Every open assigned task, or null. Null is "this fetch is not usable" — a failed page, or more
 * pages than the cap allows — and the caller must leave the snapshot exactly as it found it.
 */
export async function acFetchAssignedTasks(
  fetchPage: AcTaskPollerDeps['fetchPage']
): Promise<ActiveCollabTask[] | null> {
  const tasks: ActiveCollabTask[] = []
  for (let page = 1; page <= AC_POLL_MAX_PAGES; page += 1) {
    const result = await fetchPage(page)
    if (!result.ok) {
      return null
    }
    tasks.push(...result.value.tasks)
    if (!result.value.hasMore) {
      return tasks
    }
  }
  return null
}

export function createAcTaskPoller(deps: AcTaskPollerDeps): AcTaskPoller {
  let cancelTimer: (() => void) | null = null
  let running = false
  let failures = 0
  let inFlight = false

  const stop = (): void => {
    running = false
    cancelTimer?.()
    cancelTimer = null
  }

  const scheduleNext = (delayMs: number): void => {
    if (!running) {
      return
    }
    cancelTimer?.()
    cancelTimer = deps.schedule(delayMs, tick)
  }

  const poll = async (): Promise<void> => {
    if (inFlight) {
      return
    }
    const key = deps.snapshotKey()
    if (key === null || !deps.shouldPoll()) {
      // Disconnected, or nothing left that could show the result. Nothing to poll for.
      stop()
      return
    }
    inFlight = true
    try {
      const tasks = await acFetchAssignedTasks(deps.fetchPage)
      if (tasks === null) {
        failures += 1
        return
      }
      failures = 0
      const { changes, snapshot } = acDiffTaskSnapshot({
        previous: deps.loadSnapshot(key),
        tasks,
        now: deps.now()
      })
      deps.saveSnapshot(key, snapshot)
      // Snapshot first: saving counts cannot create the file, so the seeding poll has to.
      const previousUnread = deps.loadUnread(key)
      const unread = acMergeTaskUnread({ unread: previousUnread, changes, tasks })
      if (unread !== previousUnread) {
        deps.saveUnread(key, unread)
        deps.onUnread(unread)
      }
      const kinds = deps.notifyKinds()
      for (const change of changes) {
        if (kinds.has(change.kind)) {
          deps.emit(change)
        }
      }
    } finally {
      inFlight = false
    }
  }

  function tick(): void {
    cancelTimer = null
    void poll().then(() => {
      scheduleNext(
        failures === 0
          ? AC_POLL_INTERVAL_MS
          : Math.min(AC_POLL_INTERVAL_MS * 2 ** failures, AC_POLL_MAX_BACKOFF_MS)
      )
    })
  }

  return {
    start: (): void => {
      if (running) {
        return
      }
      running = true
      failures = 0
      scheduleNext(AC_POLL_START_DELAY_MS)
    },
    stop,
    refresh: (): void => {
      if (deps.snapshotKey() !== null && deps.shouldPoll()) {
        if (!running) {
          running = true
          failures = 0
          scheduleNext(AC_POLL_START_DELAY_MS)
        }
        return
      }
      stop()
    },
    poll
  }
}
