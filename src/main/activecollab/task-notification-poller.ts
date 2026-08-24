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
import type {
  ActiveCollabObjectUpdate,
  ActiveCollabTask,
  ActiveCollabTaskPage,
  ActiveCollabUpdates
} from '../../shared/activecollab-types'
import { acDiffMentions, type AcMentionSeen } from './mention-detector'
import {
  acDiffTaskSnapshot,
  type AcTaskChange,
  type AcTaskChangeKind,
  type AcTaskSnapshot
} from './task-change-detector'
import { acMergeTaskUnread, type AcTaskUnread } from './task-unread'

export const AC_POLL_START_DELAY_MS = 15_000
export const AC_POLL_MAX_BACKOFF_MS = 15 * 60_000

/** 1000 tasks. Past this the fetch is returned truncated and flagged, never failed: an outage
 *  and a heavy workload must not look alike (a failure drives permanent backoff). */
export const AC_POLL_MAX_PAGES = 10

/** Banners a single poll may emit individually; above this each kind coalesces into one summary.
 *  A bulk re-assignment of 40 tasks must not be 40 simultaneous native banners. */
export const AC_POLL_BANNER_CAP = 3

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
  /**
   * Told once when the instance rejects the stored token. The poller stops itself first —
   * backing off against a dead credential is retrying a request that can never succeed — and
   * `refresh()` after a reconnect is what re-arms it.
   */
  onAuthFailure?: () => void
  /**
   * One coalesced banner per kind when a poll's banner-eligible changes exceed
   * AC_POLL_BANNER_CAP. Absent = no cap (tests mostly); production always provides it.
   */
  emitSummary?: (kind: AcTaskChangeKind, count: number) => void
  /**
   * The mention pass, all-or-nothing: absent means the feature is off, and the poller then behaves
   * exactly as it did before it existed. `mentionsEnabled` is the banner toggle — read here rather
   * than folded into `notifyKinds`, because a mention is not one of the diff's kinds.
   */
  fetchMentions?: () => Promise<ActiveCollabResult<ActiveCollabUpdates>>
  loadMentionSeen?: (key: string) => AcMentionSeen | null
  saveMentionSeen?: (key: string, seen: AcMentionSeen) => void
  emitMention?: (update: ActiveCollabObjectUpdate) => void
  mentionsEnabled?: () => boolean
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

export type AcAssignedTasksFetch =
  /** `truncated` = more pages existed than the cap allows; the list is complete to 1000 and
   *  still safe to diff — the grace window in the detector absorbs the tail. */
  | { ok: true; tasks: ActiveCollabTask[]; truncated?: boolean }
  /** "This fetch is not usable" — a failed page or a rejected fetch — and the caller must leave
   *  the snapshot exactly as it found it. `auth` marks the one failure retrying can never fix:
   *  the instance rejected the stored token. */
  | { ok: false; auth: boolean }

/** Every open assigned task, de-duplicated by id, or a tagged failure. */
export async function acFetchAssignedTasks(
  fetchPage: AcTaskPollerDeps['fetchPage']
): Promise<AcAssignedTasksFetch> {
  const tasks: ActiveCollabTask[] = []
  const seenIds = new Set<number>()
  for (let page = 1; page <= AC_POLL_MAX_PAGES; page += 1) {
    let result: ActiveCollabResult<ActiveCollabTaskPage>
    try {
      result = await fetchPage(page)
    } catch {
      // A rejected fetch is a failed fetch; it must not escape and end the caller's loop.
      return { ok: false, auth: false }
    }
    if (!result.ok) {
      return { ok: false, auth: result.kind === 'auth' }
    }
    let added = 0
    for (const task of result.value.tasks) {
      if (seenIds.has(task.id)) {
        continue
      }
      seenIds.add(task.id)
      tasks.push(task)
      added += 1
    }
    // Some instances ignore `page` on this endpoint and reprint page 1 while the headers still
    // claim more pages (the same class of bug listProjectTasks guards against). Either signal —
    // the server echoing a smaller page than asked, or a follow-up page adding nothing new —
    // means paging is DONE, not that the fetch failed; without these guards such an instance
    // returns a permanent failure for anyone holding more than one page of tasks.
    const echoedPage = result.value.page
    if (
      page > 1 &&
      (added === 0 || (typeof echoedPage === 'number' && echoedPage > 0 && echoedPage < page))
    ) {
      return { ok: true, tasks }
    }
    if (!result.value.hasMore) {
      return { ok: true, tasks }
    }
  }
  return { ok: true, tasks, truncated: true }
}

export function createAcTaskPoller(deps: AcTaskPollerDeps): AcTaskPoller {
  let cancelTimer: (() => void) | null = null
  let running = false
  let failures = 0
  let inFlight = false
  let warnedTruncated = false
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

  /**
   * The mention pass. Deliberately NOT part of the diff above: the assigned-task page carries no
   * mention data, so mentions come from the notifications stream instead (see mention-detector.ts).
   *
   * Read only while the banner is wanted. Unlike the four diff kinds, a mention has no unread
   * counterpart to keep warm — `acMergeTaskUnread` prunes against the assigned-task fetch, so a
   * mention on somebody else's task could never be cleared by reading it — which makes a read for a
   * switched-off banner a request that buys nothing.
   *
   * Its failures are its own: a refused stream read leaves the marker untouched and never touches
   * the diff's backoff, because the task poll above already succeeded.
   */
  const pollMentions = async (key: string): Promise<void> => {
    const { fetchMentions, loadMentionSeen, saveMentionSeen, emitMention, mentionsEnabled } = deps
    if (
      !fetchMentions ||
      !loadMentionSeen ||
      !saveMentionSeen ||
      !emitMention ||
      mentionsEnabled?.() !== true
    ) {
      return
    }
    const result = await fetchMentions()
    if (!result.ok) {
      // Never act on a failed read: the same rule the task diff lives by.
      return
    }
    const { mentions, seen } = acDiffMentions({
      previous: loadMentionSeen(key),
      updates: result.value.updates
    })
    // Marker first, and for EVERY mention found: a banner we chose not to show must not be
    // rediscovered as new on the next poll.
    saveMentionSeen(key, seen)
    // Bounded like the diff's banners. A backlog surfacing at once is capped rather than summarised
    // because a mention summary would say nothing useful — "3 mentions" names no task to open.
    for (const mention of mentions.slice(0, AC_POLL_BANNER_CAP)) {
      emitMention(mention)
    }
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
      const fetched = await acFetchAssignedTasks(deps.fetchPage)
      if (!fetched.ok) {
        if (fetched.auth) {
          // A rejected token cannot heal by retrying: stop instead of backing off, and say so
          // once. refresh() after a successful reconnect re-arms the loop.
          stop()
          deps.onAuthFailure?.()
          return
        }
        failures += 1
        return
      }
      failures = 0
      if (fetched.truncated && !warnedTruncated) {
        warnedTruncated = true
        console.warn(
          `[ac-poller] more than ${AC_POLL_MAX_PAGES * 100} open assigned tasks; ` +
            'notifications cover the first pages only'
        )
      }
      const { changes, snapshot } = acDiffTaskSnapshot({
        previous: deps.loadSnapshot(key),
        tasks: fetched.tasks,
        now: deps.now()
      })
      deps.saveSnapshot(key, snapshot)
      // Snapshot first: saving counts cannot create the file, so the seeding poll has to.
      const previousUnread = deps.loadUnread(key)
      const unread = acMergeTaskUnread({ unread: previousUnread, changes, tasks: fetched.tasks })
      if (unread !== previousUnread) {
        deps.saveUnread(key, unread)
        deps.onUnread(unread)
      }
      const kinds = deps.notifyKinds()
      const wanted = changes.filter((change) => kinds.has(change.kind))
      if (wanted.length <= AC_POLL_BANNER_CAP || !deps.emitSummary) {
        for (const change of wanted) {
          deps.emit(change)
        }
      } else {
        // Storm cap: one summary banner per kind instead of one banner per task.
        const counts = new Map<AcTaskChangeKind, number>()
        for (const change of wanted) {
          counts.set(change.kind, (counts.get(change.kind) ?? 0) + 1)
        }
        for (const [kind, count] of counts) {
          deps.emitSummary(kind, count)
        }
      }

      await pollMentions(key)
    } finally {
      inFlight = false
    }
  }

  function tick(): void {
    cancelTimer = null
    const startedAt = deps.now()
    // catch before then, not a bare then: a poll that rejects (a disk write, an unexpected
    // fault) must not end the loop — the next tick IS the recovery path.
    void poll()
      .catch(() => undefined)
      .then(() => {
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
