import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabTask, ActiveCollabTaskPage } from '../../shared/activecollab-types'
import type { GlobalSettings, NotificationSettings } from '../../shared/types'
import { getDefaultNotificationSettings } from '../../shared/constants'
import type { Store } from '../persistence'

const { dispatchMock, keyMock, loadMock, saveMock, loadUnreadMock, saveUnreadMock, broadcastMock } =
  vi.hoisted(() => ({
    dispatchMock: vi.fn(async () => ({ delivered: true })),
    keyMock: vi.fn<() => string | null>(),
    loadMock: vi.fn(),
    saveMock: vi.fn(),
    // Unread accrues on every poll regardless of the banner toggles, so the service now reads and
    // writes it alongside the snapshot and broadcasts the result to the renderer.
    loadUnreadMock: vi.fn(() => ({})),
    saveUnreadMock: vi.fn(),
    broadcastMock: vi.fn()
  }))

// The dispatch path itself is proved in ipc/notifications.test.ts; stubbed here so this file does
// not drag in the tray, the sound assets and a BrowserWindow.
vi.mock('../ipc/notifications', () => ({ dispatchMainProcessNotification: dispatchMock }))

vi.mock('../ipc/activecollab-unread', () => ({ broadcastAcTaskUnread: broadcastMock }))

vi.mock('./task-snapshot-store', () => ({
  acCurrentTaskSnapshotKey: keyMock,
  acLoadTaskSnapshot: loadMock,
  acSaveTaskSnapshot: saveMock,
  acLoadTaskUnread: loadUnreadMock,
  acSaveTaskUnread: saveUnreadMock
}))

import { DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS } from '../../shared/activecollab-poll-interval'
import {
  acChangeNotification,
  acEnabledChangeKinds,
  refreshAcTaskNotifications,
  startAcTaskNotifications,
  stopAcTaskNotifications
} from './task-notification-service'
import { AC_POLL_START_DELAY_MS } from './task-notification-poller'

const NOW = new Date(2026, 6, 28, 12, 0, 0).getTime()
const KEY = 'https://projects.efront.com.au#407'

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...getDefaultNotificationSettings(), ...overrides }
}

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

describe('acEnabledChangeKinds', () => {
  it('is empty by default, so nobody is polled without asking', () => {
    expect(acEnabledChangeKinds(settings()).size).toBe(0)
  })

  it('maps each toggle to its kind', () => {
    expect([...acEnabledChangeKinds(settings({ activeCollabAssigned: true }))]).toEqual([
      'assigned'
    ])
    expect([...acEnabledChangeKinds(settings({ activeCollabComments: true }))]).toEqual([
      'comments'
    ])
    expect([...acEnabledChangeKinds(settings({ activeCollabDue: true }))]).toEqual(['due'])
    expect([...acEnabledChangeKinds(settings({ activeCollabUpdated: true }))]).toEqual(['updated'])
  })

  it('obeys the master switch over all four', () => {
    const allOn = {
      activeCollabAssigned: true,
      activeCollabComments: true,
      activeCollabDue: true,
      activeCollabUpdated: true
    }

    expect(acEnabledChangeKinds(settings(allOn)).size).toBe(4)
    expect(acEnabledChangeKinds(settings({ ...allOn, enabled: false })).size).toBe(0)
  })
})

describe('acChangeNotification', () => {
  it('names the task, the project and the count', () => {
    const request = acChangeNotification(
      { kind: 'comments', task: acTask({ id: 1 }), newComments: 3 },
      NOW
    )

    expect(request.source).toBe('activecollab-comments')
    expect(request.activeCollab).toEqual({
      // The ids are what a notification click routes on; the names are only ever displayed.
      taskId: 1,
      projectId: 3790,
      taskName: 'Fix the header',
      projectName: 'Muster',
      newComments: 3
    })
  })

  it('keys dedupe and replacement per task and kind', () => {
    const comments = acChangeNotification(
      { kind: 'comments', task: acTask({ id: 7 }), newComments: 1 },
      NOW
    )
    const due = acChangeNotification(
      { kind: 'due', task: acTask({ id: 7 }), bucket: 'overdue' },
      NOW
    )

    expect(comments.dedupeKey).toBe('activecollab:7:comments')
    expect(comments.notificationId).toBe(comments.dedupeKey)
    expect(due.dedupeKey).toBe('activecollab:7:due')
  })

  it('phrases the bucket a due change escalated into', () => {
    const request = acChangeNotification(
      { kind: 'due', task: acTask({ id: 1 }), bucket: 'today' },
      NOW
    )

    expect(request.source).toBe('activecollab-due')
    expect(request.activeCollab?.duePhrase).toBe('Due today')
  })

  it('adds the due phrase to an assignment only when the date is close enough to matter', () => {
    const soon = acChangeNotification(
      { kind: 'assigned', task: acTask({ id: 1, dueOn: new Date(2026, 6, 20).getTime() }) },
      NOW
    )
    const distant = acChangeNotification(
      { kind: 'assigned', task: acTask({ id: 1, dueOn: new Date(2026, 7, 20).getTime() }) },
      NOW
    )

    expect(soon.source).toBe('activecollab-assigned')
    expect(soon.activeCollab?.duePhrase).toBe('Overdue')
    expect(distant.activeCollab?.duePhrase).toBeUndefined()
  })

  it('carries no due phrase on a plain edit', () => {
    const request = acChangeNotification({ kind: 'updated', task: acTask({ id: 1 }) }, NOW)

    expect(request.source).toBe('activecollab-updated')
    expect(request.activeCollab?.duePhrase).toBeUndefined()
  })
})

describe('the running service', () => {
  let notifications = settings()
  let pollIntervalMs: number | undefined
  let settingsListener: (() => void) | null = null
  let fetchPage = vi.fn<(page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>>()

  const store = {
    getSettings: () =>
      ({ notifications, activeCollabPollIntervalMs: pollIntervalMs }) as unknown as GlobalSettings,
    onSettingsChanged: (listener: () => void) => {
      settingsListener = listener
      return () => {
        settingsListener = null
      }
    }
  } as unknown as Store

  beforeEach(() => {
    vi.useFakeTimers()
    notifications = settings({ activeCollabComments: true })
    pollIntervalMs = undefined
    settingsListener = null
    dispatchMock.mockClear()
    keyMock.mockReset()
    keyMock.mockReturnValue(KEY)
    loadMock.mockReset()
    loadMock.mockReturnValue({
      '1': { commentCount: 1, notifiedDueBucket: 'none', updatedOn: null }
    })
    saveMock.mockReset()
    fetchPage = vi.fn(async () => ({
      ok: true as const,
      value: { tasks: [acTask({ id: 1, commentCount: 3 })], totalItems: 1, hasMore: false }
    }))
  })

  afterEach(() => {
    stopAcTaskNotifications()
    vi.useRealTimers()
  })

  it('polls once started and dispatches the change through the notification path', async () => {
    startAcTaskNotifications({ store, fetchPage })

    await vi.advanceTimersByTimeAsync(AC_POLL_START_DELAY_MS)

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'activecollab-comments',
        activeCollab: expect.objectContaining({ newComments: 2 })
      })
    )

    await vi.advanceTimersByTimeAsync(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('keeps polling with every toggle off, so the unread badge still moves', async () => {
    // Superseded guarantee: this used to assert no poll at all with the toggles off. The badge is
    // a quieter surface than a banner and the user asked for a count they can clear, so polling
    // now follows the CONNECTION and the toggles only decide whether a banner also fires.
    notifications = settings()

    startAcTaskNotifications({ store, fetchPage })
    await vi.advanceTimersByTimeAsync(
      AC_POLL_START_DELAY_MS + DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS
    )

    expect(fetchPage).toHaveBeenCalled()
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it('dispatches a banner once a toggle is switched on, and stops dispatching when it goes off', async () => {
    notifications = settings()
    startAcTaskNotifications({ store, fetchPage })
    await vi.advanceTimersByTimeAsync(AC_POLL_START_DELAY_MS)
    expect(dispatchMock).not.toHaveBeenCalled()

    notifications = settings({ activeCollabDue: true })
    settingsListener?.()
    await vi.advanceTimersByTimeAsync(
      AC_POLL_START_DELAY_MS + DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS
    )
    const withToggleOn = dispatchMock.mock.calls.length

    notifications = settings()
    settingsListener?.()
    await vi.advanceTimersByTimeAsync(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS * 3)

    // Polling continues for the badge; only the banner stops.
    expect(dispatchMock.mock.calls.length).toBe(withToggleOn)
  })

  it('stops on disconnect and starts again on reconnect', async () => {
    startAcTaskNotifications({ store, fetchPage })
    keyMock.mockReturnValue(null)

    refreshAcTaskNotifications()
    await vi.advanceTimersByTimeAsync(
      AC_POLL_START_DELAY_MS + DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS
    )
    expect(fetchPage).not.toHaveBeenCalled()

    keyMock.mockReturnValue(KEY)
    refreshAcTaskNotifications()
    await vi.advanceTimersByTimeAsync(AC_POLL_START_DELAY_MS)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('replaces its loop instead of running two when registration repeats', async () => {
    startAcTaskNotifications({ store, fetchPage })
    startAcTaskNotifications({ store, fetchPage })

    await vi.advanceTimersByTimeAsync(AC_POLL_START_DELAY_MS)

    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('takes a cadence change live, without a restart', async () => {
    pollIntervalMs = 600_000
    startAcTaskNotifications({ store, fetchPage })
    await vi.advanceTimersByTimeAsync(AC_POLL_START_DELAY_MS)
    expect(fetchPage).toHaveBeenCalledTimes(1)

    // Still inside the ten-minute window the first poll armed.
    await vi.advanceTimersByTimeAsync(DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS)
    expect(fetchPage).toHaveBeenCalledTimes(1)

    pollIntervalMs = 15_000
    settingsListener?.()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})
