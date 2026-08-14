import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import {
  DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS,
  MAX_ACTIVECOLLAB_POLL_INTERVAL_MS,
  MIN_ACTIVECOLLAB_POLL_INTERVAL_MS
} from '../../shared/activecollab-poll-interval'
import type { ActiveCollabTask, ActiveCollabTaskPage } from '../../shared/activecollab-types'
import type { AcTaskChange, AcTaskChangeKind, AcTaskSnapshot } from './task-change-detector'
import type { AcTaskUnread } from './task-unread'
import {
  AC_POLL_MAX_BACKOFF_MS,
  AC_POLL_MAX_PAGES,
  AC_POLL_START_DELAY_MS,
  acFetchAssignedTasks,
  createAcTaskPoller,
  type AcTaskPoller
} from './task-notification-poller'

const NOW = new Date(2026, 6, 28, 12, 0, 0).getTime()
const EARLIER = new Date(2026, 6, 28, 9, 0, 0).getTime()
const KEY = 'https://projects.efront.com.au#407'

function acTask(overrides: Partial<ActiveCollabTask> & { id: number }): ActiveCollabTask {
  return {
    projectId: 3790,
    projectName: 'Muster',
    taskNumber: 12,
    name: 'Fix the header',
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 407,
    assigneeName: 'Jake Varrese',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/3790/tasks/${overrides.id}`,
    taskListId: null,
    ...overrides
  }
}

function page(
  tasks: ActiveCollabTask[],
  hasMore = false
): ActiveCollabResult<ActiveCollabTaskPage> {
  return { ok: true, value: { tasks, totalItems: tasks.length, hasMore } }
}

const FETCH_FAILED: ActiveCollabResult<ActiveCollabTaskPage> = {
  ok: false,
  kind: 'api',
  error: 'Service Unavailable',
  status: 503
}

/** One timer slot, because the poller only ever holds one. */
type PendingTimer = { delayMs: number; run: () => void } | null

let pending: PendingTimer = null
let cancelCount = 0
let stored: AcTaskSnapshot | null = null
let emitted: AcTaskChange[] = []
let snapshotKey: string | null = KEY
/** Unset by default, matching a user who never touched the cadence. */
let pollIntervalMs: number | null | undefined
let enabled: AcTaskChangeKind[] = ['assigned', 'comments', 'due', 'updated']
let fetchPage = vi.fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
let saveSnapshot = vi.fn<(key: string, snapshot: AcTaskSnapshot) => void>()
// Unread accrues independently of the notify kinds, so the poller now carries its own load/save
// pair and an onUnread signal. Held here so a test can assert badge movement without a banner.
let storedUnread: AcTaskUnread = {}
let saveUnread = vi.fn<(key: string, unread: AcTaskUnread) => void>()
let unreadSignals: AcTaskUnread[] = []
let authFailures = 0

function poller(): AcTaskPoller {
  return createAcTaskPoller({
    now: () => NOW,
    intervalMs: () => pollIntervalMs,
    snapshotKey: () => snapshotKey,
    // Polling is gated on having somewhere to put the result, not on the banner toggles.
    shouldPoll: () => snapshotKey !== null,
    notifyKinds: () => new Set(enabled),
    fetchPage,
    loadSnapshot: (key) => (key === KEY ? stored : null),
    saveSnapshot,
    loadUnread: (key) => (key === KEY ? storedUnread : {}),
    saveUnread,
    emit: (change) => emitted.push(change),
    onUnread: (unread) => unreadSignals.push(unread),
    schedule: (delayMs, run) => {
      pending = { delayMs, run }
      return () => {
        cancelCount += 1
        pending = null
      }
    },
    onAuthFailure: () => {
      authFailures += 1
    }
  })
}

/** Runs the scheduled timer and drains the microtasks its async poll runs on. */
async function fireTimer(): Promise<void> {
  const timer = pending
  pending = null
  timer?.run()
  for (let drain = 0; drain < 25; drain += 1) {
    await Promise.resolve()
  }
}

beforeEach(() => {
  pending = null
  cancelCount = 0
  stored = null
  emitted = []
  authFailures = 0
  snapshotKey = KEY
  pollIntervalMs = undefined
  enabled = ['assigned', 'comments', 'due', 'updated']
  fetchPage = vi.fn()
  saveSnapshot = vi.fn((key, snapshot) => {
    if (key === KEY) {
      stored = snapshot
    }
  })
  storedUnread = {}
  unreadSignals = []
  saveUnread = vi.fn((key, unread) => {
    if (key === KEY) {
      storedUnread = unread
    }
  })
})

describe('when to poll at all', () => {
  it('does not schedule anything while ActiveCollab is not connected', () => {
    snapshotKey = null

    poller().refresh()

    expect(pending).toBeNull()
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('still polls with every banner kind switched off, because the badge is not gated on them', async () => {
    // Superseded guarantee: this used to assert no poll at all. Unread counts now accrue whether
    // or not the user wants a banner, so polling is gated on `shouldPoll` (are we connected) and
    // `notifyKinds` only decides whether a change is ALSO emitted as a notification.
    enabled = []
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    const running = poller()

    running.refresh()
    expect(pending).not.toBeNull()

    await fireTimer()

    expect(fetchPage).toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('does not schedule anything when there is nowhere to put the result', () => {
    snapshotKey = null

    poller().refresh()

    expect(pending).toBeNull()
  })

  it('starts on a short delay, then settles into the one-minute cadence', async () => {
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    const running = poller()

    running.refresh()
    expect(pending?.delayMs).toBe(AC_POLL_START_DELAY_MS)

    await fireTimer()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(pending?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    expect(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS).toBe(60_000)
  })

  it('starts once however many times it is refreshed', () => {
    const running = poller()

    running.refresh()
    running.refresh()
    running.start()

    expect(cancelCount).toBe(0)
    expect(pending?.delayMs).toBe(AC_POLL_START_DELAY_MS)
  })

  it('stops on disconnect, mid-loop', async () => {
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    const running = poller()
    running.refresh()
    await fireTimer()

    snapshotKey = null
    running.refresh()

    expect(pending).toBeNull()
    expect(cancelCount).toBe(1)
  })

  it('stops the loop when a tick finds the credential gone', async () => {
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    const running = poller()
    running.refresh()
    snapshotKey = null

    await fireTimer()

    expect(fetchPage).not.toHaveBeenCalled()
    expect(pending).toBeNull()
  })
})

describe('the configured cadence', () => {
  it('polls on the interval the user chose', async () => {
    pollIntervalMs = 120_000
    fetchPage.mockResolvedValue(page([]))
    const running = poller()

    running.refresh()
    await fireTimer()

    expect(pending?.delayMs).toBe(120_000)
  })

  it('clamps a cadence below the floor rather than hammering the instance', async () => {
    pollIntervalMs = 1_000
    fetchPage.mockResolvedValue(page([]))
    const running = poller()

    running.refresh()
    await fireTimer()

    expect(pending?.delayMs).toBe(MIN_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('clamps a cadence above the ceiling, so a typo cannot silence the loop', async () => {
    pollIntervalMs = 99 * 60 * 60_000
    fetchPage.mockResolvedValue(page([]))
    const running = poller()

    running.refresh()
    await fireTimer()

    expect(pending?.delayMs).toBe(MAX_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('falls back to the default when the stored value is not a usable number', async () => {
    pollIntervalMs = Number.NaN
    fetchPage.mockResolvedValue(page([]))
    const running = poller()

    running.refresh()
    await fireTimer()

    expect(pending?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('re-arms the pending poll when the cadence changes, with no restart', async () => {
    fetchPage.mockResolvedValue(page([]))
    const running = poller()
    running.refresh()
    await fireTimer()
    expect(pending?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)

    pollIntervalMs = 300_000
    running.refresh()

    expect(pending?.delayMs).toBe(300_000)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('re-arms a backed-off timer on the new cadence, keeping the backoff multiplier', async () => {
    fetchPage.mockResolvedValue(FETCH_FAILED)
    const running = poller()
    running.refresh()
    await fireTimer()
    expect(pending?.delayMs).toBe(2 * DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)

    pollIntervalMs = 200_000
    running.refresh()

    expect(pending?.delayMs).toBe(400_000)
  })

  it('leaves the pending timer alone when a settings change did not touch the cadence', async () => {
    fetchPage.mockResolvedValue(page([]))
    const running = poller()
    running.refresh()
    await fireTimer()
    const before = cancelCount

    running.refresh()

    expect(cancelCount).toBe(before)
    expect(pending?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('does not re-arm the start delay, which is about app startup rather than cadence', () => {
    const running = poller()
    running.refresh()
    expect(pending?.delayMs).toBe(AC_POLL_START_DELAY_MS)

    pollIntervalMs = 300_000
    running.refresh()

    expect(pending?.delayMs).toBe(AC_POLL_START_DELAY_MS)
  })

  it('counts a slow poll against the next interval instead of waiting it out twice', async () => {
    // A 429 that honoured a Retry-After can hold one poll open for a minute; the loop must not then
    // add a full interval on top of that.
    let clock = NOW
    fetchPage.mockImplementation(async () => {
      clock += 40_000
      return page([])
    })
    const running = createAcTaskPoller({
      now: () => clock,
      intervalMs: () => 90_000,
      snapshotKey: () => KEY,
      shouldPoll: () => true,
      notifyKinds: () => new Set<AcTaskChangeKind>(),
      fetchPage,
      loadSnapshot: () => null,
      saveSnapshot,
      loadUnread: () => ({}),
      saveUnread,
      emit: (change) => emitted.push(change),
      onUnread: (unread) => unreadSignals.push(unread),
      schedule: (delayMs, run) => {
        pending = { delayMs, run }
        return () => {
          cancelCount += 1
          pending = null
        }
      }
    })

    running.refresh()
    await fireTimer()

    expect(pending?.delayMs).toBe(50_000)
  })
})

describe('a fetch that did not work', () => {
  it('leaves the snapshot untouched, emits nothing, and does not re-announce on recovery', async () => {
    const tasks = [acTask({ id: 1, commentCount: 2, updatedOn: EARLIER })]
    fetchPage.mockResolvedValue(page(tasks))
    const running = poller()
    running.refresh()
    await fireTimer()
    const seeded = stored
    expect(seeded).not.toBeNull()
    saveSnapshot.mockClear()

    fetchPage.mockResolvedValue(FETCH_FAILED)
    await fireTimer()

    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(stored).toBe(seeded)
    expect(emitted).toEqual([])

    fetchPage.mockResolvedValue(page(tasks))
    await fireTimer()

    // The recovered poll compares against the snapshot the failure did not touch.
    expect(emitted).toEqual([])
  })

  it('backs off while failures repeat, to a ceiling, and recovers the cadence on success', async () => {
    // Doubling from a 1-minute base: 2, 4, 8, then 16 which the 15-minute ceiling clamps.
    fetchPage.mockResolvedValue(FETCH_FAILED)
    const running = poller()
    running.refresh()

    await fireTimer()
    expect(pending?.delayMs).toBe(2 * DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(4 * DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(8 * DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    await fireTimer()
    // 16 minutes would exceed the ceiling, so it clamps and stays there.
    expect(pending?.delayMs).toBe(AC_POLL_MAX_BACKOFF_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(AC_POLL_MAX_BACKOFF_MS)

    fetchPage.mockResolvedValue(page([]))
    await fireTimer()
    expect(pending?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('treats a page fault mid-way through paging as a failed fetch, not a shorter list', async () => {
    fetchPage.mockImplementation(async (requested) =>
      requested === 1 ? page([acTask({ id: 1 })], true) : FETCH_FAILED
    )

    await poller().poll()

    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('stops the loop and reports once when the token is rejected', async () => {
    fetchPage.mockResolvedValue({ ok: false, kind: 'auth', error: 'Invalid token', status: 401 })
    const p = poller()
    p.start()
    pending?.run()
    // The fired timer object is stale from here; only a re-arm would repopulate it.
    pending = null
    await vi.waitFor(() => expect(authFailures).toBe(1))
    // Let tick's post-poll scheduling turn run before asserting it did nothing.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Stopped, not backing off: no timer was re-armed against the dead credential.
    expect(pending).toBeNull()
    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('a non-auth failure keeps the loop alive and never calls onAuthFailure', async () => {
    fetchPage.mockResolvedValue(FETCH_FAILED)
    const p = poller()
    p.start()
    pending?.run()
    await vi.waitFor(() => expect(pending).not.toBeNull())

    expect(authFailures).toBe(0)
  })

  it('a truncated fetch still diffs and does not count as a failure', async () => {
    // Every page full and distinct: the cap trips, the first 1000 still land in the snapshot.
    fetchPage.mockImplementation(async (requested) => page([acTask({ id: requested })], true))
    const p = poller()
    p.start()
    pending?.run()
    pending = null

    await vi.waitFor(() => expect(saveSnapshot).toHaveBeenCalled())
    await vi.waitFor(() => expect(pending).not.toBeNull())
    // Read through a widened alias: TS narrows `pending` to null after the assignment above and
    // cannot see the schedule closure repopulating it.
    const rearmed = pending as PendingTimer
    // Success cadence, not backoff: the next delay is the plain default interval.
    expect(rearmed?.delayMs).toBe(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
  })

  it('coalesces a banner storm into one summary per kind', async () => {
    stored = {}
    // Six new assignments against an empty (but existing) snapshot = six banner-eligible changes.
    fetchPage.mockResolvedValue(
      page([1, 2, 3, 4, 5, 6].map((id) => acTask({ id, name: `Task ${id}` })))
    )
    const summaries: { kind: AcTaskChangeKind; count: number }[] = []
    const p = createAcTaskPoller({
      now: () => NOW,
      intervalMs: () => undefined,
      snapshotKey: () => KEY,
      shouldPoll: () => true,
      notifyKinds: () => new Set<AcTaskChangeKind>(['assigned']),
      fetchPage,
      loadSnapshot: () => stored,
      saveSnapshot,
      loadUnread: () => storedUnread,
      saveUnread,
      emit: (change) => emitted.push(change),
      onUnread: () => undefined,
      schedule: () => () => undefined,
      emitSummary: (kind, count) => summaries.push({ kind, count })
    })

    await p.poll()

    expect(emitted).toEqual([])
    expect(summaries).toEqual([{ kind: 'assigned', count: 6 }])
  })

  it('emits individually at or under the cap even when a summary channel exists', async () => {
    stored = {}
    fetchPage.mockResolvedValue(page([1, 2, 3].map((id) => acTask({ id }))))
    const summaries: unknown[] = []
    const p = createAcTaskPoller({
      now: () => NOW,
      intervalMs: () => undefined,
      snapshotKey: () => KEY,
      shouldPoll: () => true,
      notifyKinds: () => new Set<AcTaskChangeKind>(['assigned']),
      fetchPage,
      loadSnapshot: () => stored,
      saveSnapshot,
      loadUnread: () => storedUnread,
      saveUnread,
      emit: (change) => emitted.push(change),
      onUnread: () => undefined,
      schedule: () => () => undefined,
      emitSummary: (kind, count) => summaries.push({ kind, count })
    })

    await p.poll()

    expect(emitted).toHaveLength(3)
    expect(summaries).toEqual([])
  })

  it('reschedules even when the poll itself rejects, so one fault cannot end the loop', async () => {
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    saveSnapshot.mockImplementation(() => {
      throw new Error('disk full')
    })
    const p = poller()
    p.start()
    pending?.run()

    await vi.waitFor(() => expect(pending).not.toBeNull())
  })
})

describe('acFetchAssignedTasks', () => {
  it('pages until the server says there is no more', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockImplementation(async (requested) =>
        requested < 3 ? page([acTask({ id: requested })], true) : page([acTask({ id: 3 })])
      )

    expect(await acFetchAssignedTasks(fetch)).toEqual({
      ok: true,
      tasks: [acTask({ id: 1 }), acTask({ id: 2 }), acTask({ id: 3 })]
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('flags a list longer than the cap as truncated success, never as a failure', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockImplementation(async (requested) =>
        // Distinct ids per page, or the dedupe guard would (correctly) end paging early.
        page([acTask({ id: requested })], true)
      )

    const fetched = await acFetchAssignedTasks(fetch)

    expect(fetched.ok).toBe(true)
    expect(fetched.ok && fetched.truncated).toBe(true)
    expect(fetched.ok && fetched.tasks).toHaveLength(AC_POLL_MAX_PAGES)
    expect(fetch).toHaveBeenCalledTimes(AC_POLL_MAX_PAGES)
  })

  it('ends paging when a follow-up page reprints rows already seen (page-echo bug)', async () => {
    // Models the instances that ignore `page` and answer page 1 forever while the headers
    // still claim more pages exist.
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockResolvedValue(page([acTask({ id: 1 }), acTask({ id: 2 })], true))

    expect(await acFetchAssignedTasks(fetch)).toEqual({
      ok: true,
      tasks: [acTask({ id: 1 }), acTask({ id: 2 })]
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('ends paging when the server echoes a smaller page number than was asked for', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockImplementation(async (requested) => ({
        ok: true,
        value: {
          tasks: [acTask({ id: requested === 1 ? 1 : 100 + requested })],
          totalItems: null,
          hasMore: true,
          page: 1
        }
      }))

    const fetched = await acFetchAssignedTasks(fetch)

    expect(fetched.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates a task that appears on two pages of one fetch', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockImplementation(async (requested) =>
        requested === 1
          ? page([acTask({ id: 1 }), acTask({ id: 2 })], true)
          : page([acTask({ id: 2 }), acTask({ id: 3 })])
      )

    expect(await acFetchAssignedTasks(fetch)).toEqual({
      ok: true,
      tasks: [acTask({ id: 1 }), acTask({ id: 2 }), acTask({ id: 3 })]
    })
  })

  it('tags a rejected token as an auth failure', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockResolvedValue({ ok: false, kind: 'auth', error: 'Invalid token', status: 401 })

    expect(await acFetchAssignedTasks(fetch)).toEqual({ ok: false, auth: true })
  })

  it('turns a rejected fetch promise into a plain failure instead of throwing', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockRejectedValue(new Error('socket hang up'))

    expect(await acFetchAssignedTasks(fetch)).toEqual({ ok: false, auth: false })
  })
})

describe('what reaches the user', () => {
  it('emits one change per real change, and only for the kinds asked for', async () => {
    stored = {
      '1': { commentCount: 1, notifiedDueBucket: 'none', updatedOn: EARLIER },
      '2': { commentCount: 0, notifiedDueBucket: 'none', updatedOn: EARLIER }
    }
    enabled = ['comments']
    fetchPage.mockResolvedValue(
      page([
        acTask({ id: 1, commentCount: 3, updatedOn: NOW }),
        acTask({ id: 2, updatedOn: NOW }),
        acTask({ id: 3 })
      ])
    )

    await poller().poll()

    expect(emitted).toEqual([expect.objectContaining({ kind: 'comments', newComments: 2 })])
    // The suppressed kinds still advanced the snapshot, so enabling one later replays nothing.
    expect(stored).toEqual({
      '1': { commentCount: 3, notifiedDueBucket: 'none', updatedOn: NOW },
      '2': { commentCount: 0, notifiedDueBucket: 'none', updatedOn: NOW },
      '3': { commentCount: 0, notifiedDueBucket: 'none', updatedOn: null }
    })
  })

  it('re-reads the snapshot on every poll, so a local write folded into it is honoured', async () => {
    stored = { '1': { commentCount: 1, notifiedDueBucket: 'none', updatedOn: EARLIER } }
    fetchPage.mockResolvedValue(page([acTask({ id: 1, commentCount: 1, updatedOn: EARLIER })]))
    const running = poller()
    await running.poll()
    expect(emitted).toEqual([])

    // What ipc/activecollab.ts does after a comment this app posted.
    stored = { '1': { commentCount: 2, notifiedDueBucket: 'none', updatedOn: null } }
    fetchPage.mockResolvedValue(page([acTask({ id: 1, commentCount: 2, updatedOn: NOW })]))
    await running.poll()

    expect(emitted).toEqual([])
  })
})
