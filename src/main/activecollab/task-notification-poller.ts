// The loop that turns ActiveCollab's lack of an incremental API into notifications.
//
// Poll cadence is the USER'S, defaulting to one minute and clamped to 15s..15min. One poll is one
// request per page of open assigned tasks — one page for anyone holding under 100 — so the default
// costs 60 requests an hour per user who opted in, against a server nobody here owns. The floor is
// there because that cost is linear in the number of opted-in users on a shared instance; the
// ceiling because past a quarter of an hour a "notification" is a report.
//
// A cadence edit lands on the LIVE timer (see `refresh`): waiting out a fifteen-minute interval to
// learn whether a shorter one works is not a setting anyone would trust.
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
import {
  clampActiveCollabPollIntervalMs,
  MIN_ACTIVECOLLAB_POLL_INTERVAL_MS
} from '../../shared/activecollab-poll-interval'
import type { ActiveCollabTask, ActiveCollabTaskPage } from '../../shared/activecollab-types'
import {
  acDiffTaskSnapshot,
  type AcTaskChange,
  type AcTaskChangeKind,
  type AcTaskSnapshot
} from './task-change-detector'
import { acMergeTaskUnread, type AcTaskUnread } from './task-unread'

export const AC_POLL_START_DELAY_MS = 15_000
export const AC_POLL_MAX_BACKOFF_MS = 15 * 60_000

/** 1000 tasks. Past this the fetch is treated as incomplete rather than silently truncated. */
export const AC_POLL_MAX_PAGES = 10

export type AcTaskPollerDeps = {
  now: () => number
  /**
   * The stored cadence, RAW and re-read on every schedule so a settings change needs no restart.
   * Clamped here rather than at the call site, so no caller can forget to.
   */
  intervalMs: () => number | null | undefined
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
  /**
   * Start or stop to match the current credential and settings, and re-arm a running timer against
   * a cadence that changed under it.
   */
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
  /**
   * The cadence the pending timer was armed with, and when. Null while the timer is the start
   * delay, which is about app startup and so is not a cadence a settings edit may re-arm.
   */
  let armedInterval: number | null = null
  let armedAt = 0

  const stop = (): void => {
    running = false
    cancelTimer?.()
    cancelTimer = null
    armedInterval = null
  }

  /**
   * How long until the next poll, for a cadence, counting the time already spent since `since` —
   * a request that sat out a 429 `Retry-After` must not then wait a full interval on top of it.
   * Floored at the tightest cadence we allow anywhere, so a slow instance is never hammered.
   */
  const delayFor = (interval: number, since: number): number => {
    const target =
      failures === 0 ? interval : Math.min(interval * 2 ** failures, AC_POLL_MAX_BACKOFF_MS)
    return Math.max(target - (deps.now() - since), MIN_ACTIVECOLLAB_POLL_INTERVAL_MS)
  }

  const scheduleNext = (delayMs: number, interval: number | null): void => {
    if (!running) {
      return
    }
    cancelTimer?.()
    armedInterval = interval
    armedAt = deps.now()
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
    const startedAt = deps.now()
    void poll().then(() => {
      const interval = clampActiveCollabPollIntervalMs(deps.intervalMs())
      scheduleNext(delayFor(interval, startedAt), interval)
    })
  }

  return {
    start: (): void => {
      if (running) {
        return
      }
      running = true
      failures = 0
      scheduleNext(AC_POLL_START_DELAY_MS, null)
    },
    stop,
    refresh: (): void => {
      if (deps.snapshotKey() === null || !deps.shouldPoll()) {
        stop()
        return
      }
      if (!running) {
        running = true
        failures = 0
        scheduleNext(AC_POLL_START_DELAY_MS, null)
        return
      }
      const interval = clampActiveCollabPollIntervalMs(deps.intervalMs())
      // A cadence edit re-arms the PENDING poll, keeping the time already waited: the loop must not
      // need a restart to speed up, and nudging the field must not push the next poll away.
      if (armedInterval !== null && interval !== armedInterval) {
        scheduleNext(delayFor(interval, armedAt), interval)
      }
    },
    poll
  }
}
