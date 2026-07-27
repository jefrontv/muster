import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabTask, ActiveCollabTaskPage } from '../../shared/activecollab-types'
import type { AcTaskChange, AcTaskChangeKind, AcTaskSnapshot } from './task-change-detector'
import {
  AC_POLL_INTERVAL_MS,
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
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 407,
    assigneeName: 'Jake Varrese',
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
let enabled: AcTaskChangeKind[] = ['assigned', 'comments', 'due', 'updated']
let fetchPage = vi.fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
let saveSnapshot = vi.fn<(key: string, snapshot: AcTaskSnapshot) => void>()

function poller(): AcTaskPoller {
  return createAcTaskPoller({
    now: () => NOW,
    snapshotKey: () => snapshotKey,
    enabledKinds: () => new Set(enabled),
    fetchPage,
    loadSnapshot: (key) => (key === KEY ? stored : null),
    saveSnapshot,
    emit: (change) => emitted.push(change),
    schedule: (delayMs, run) => {
      pending = { delayMs, run }
      return () => {
        cancelCount += 1
        pending = null
      }
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
  snapshotKey = KEY
  enabled = ['assigned', 'comments', 'due', 'updated']
  fetchPage = vi.fn()
  saveSnapshot = vi.fn((key, snapshot) => {
    if (key === KEY) {
      stored = snapshot
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

  it('does not schedule anything while every kind is switched off', () => {
    enabled = []

    poller().refresh()

    expect(pending).toBeNull()
  })

  it('starts on a short delay, then settles into the three-minute cadence', async () => {
    fetchPage.mockResolvedValue(page([acTask({ id: 1 })]))
    const running = poller()

    running.refresh()
    expect(pending?.delayMs).toBe(AC_POLL_START_DELAY_MS)

    await fireTimer()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(pending?.delayMs).toBe(AC_POLL_INTERVAL_MS)
    expect(AC_POLL_INTERVAL_MS).toBe(180_000)
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
    fetchPage.mockResolvedValue(FETCH_FAILED)
    const running = poller()
    running.refresh()

    await fireTimer()
    expect(pending?.delayMs).toBe(2 * AC_POLL_INTERVAL_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(4 * AC_POLL_INTERVAL_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(AC_POLL_MAX_BACKOFF_MS)
    await fireTimer()
    expect(pending?.delayMs).toBe(AC_POLL_MAX_BACKOFF_MS)

    fetchPage.mockResolvedValue(page([]))
    await fireTimer()
    expect(pending?.delayMs).toBe(AC_POLL_INTERVAL_MS)
  })

  it('treats a page fault mid-way through paging as a failed fetch, not a shorter list', async () => {
    fetchPage.mockImplementation(async (requested) =>
      requested === 1 ? page([acTask({ id: 1 })], true) : FETCH_FAILED
    )

    await poller().poll()

    expect(saveSnapshot).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })
})

describe('acFetchAssignedTasks', () => {
  it('pages until the server says there is no more', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockImplementation(async (requested) =>
        requested < 3 ? page([acTask({ id: requested })], true) : page([acTask({ id: 3 })])
      )

    expect(await acFetchAssignedTasks(fetch)).toHaveLength(3)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refuses a list longer than the cap rather than diffing a truncated one', async () => {
    const fetch = vi
      .fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()
      .mockResolvedValue(page([acTask({ id: 1 })], true))

    expect(await acFetchAssignedTasks(fetch)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(AC_POLL_MAX_PAGES)
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
