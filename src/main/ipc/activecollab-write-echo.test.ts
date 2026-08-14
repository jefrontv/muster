// The wiring half of self-echo suppression: every write folds its own echo into the notifier's
// snapshot, and connect/disconnect start and stop the poll loop. What the fold then MEANS — that the
// next poll reports nothing — is proved against a real snapshot file in
// ../activecollab/task-snapshot-store.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ActiveCollabHttp from '../activecollab/http'
import type { Store } from '../persistence'

const {
  handleMock,
  removeHandlerMock,
  requestMock,
  createAcHttpMock,
  getCredentialMock,
  getStatusMock,
  clearCredentialMock,
  connectMock,
  resetPreflightMock,
  foldMock,
  clearSnapshotMock,
  startNotificationsMock,
  refreshNotificationsMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  requestMock: vi.fn(),
  createAcHttpMock: vi.fn(),
  getCredentialMock: vi.fn(),
  getStatusMock: vi.fn(),
  clearCredentialMock: vi.fn(),
  connectMock: vi.fn(),
  resetPreflightMock: vi.fn(),
  foldMock: vi.fn(),
  clearSnapshotMock: vi.fn(),
  startNotificationsMock: vi.fn(),
  refreshNotificationsMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
  app: { getPath: () => '/tmp/downloads' },
  dialog: { showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  BrowserWindow: { fromWebContents: () => null }
}))

vi.mock('../activecollab/http', async (importOriginal) => {
  const actual = await importOriginal<typeof ActiveCollabHttp>()
  return { ...actual, createAcHttp: createAcHttpMock }
})

vi.mock('../activecollab/credential-store', () => ({
  getActiveCollabCredential: getCredentialMock,
  getActiveCollabConnectionStatus: getStatusMock,
  clearActiveCollabCredential: clearCredentialMock
}))

vi.mock('../activecollab/auth', () => ({ connectActiveCollab: connectMock }))
vi.mock('./preflight', () => ({ _resetPreflightCache: resetPreflightMock }))

// The name join is a display concern with its own tests; here it must simply not make requests.
vi.mock('../activecollab/name-directory', () => ({
  acNameDirectory: () => async () => ({ projects: new Map(), users: new Map() }),
  acResolveTaskNames: vi.fn(async () => undefined),
  resetAcNameDirectoryCache: vi.fn()
}))

vi.mock('../activecollab/project-members', () => ({
  acProjectMembers: () => async () => [],
  resetAcProjectMembersCache: vi.fn()
}))

vi.mock('../activecollab/task-snapshot-store', () => ({
  acFoldLocalTaskWrite: foldMock,
  acClearTaskSnapshot: clearSnapshotMock
}))

vi.mock('../activecollab/task-notification-service', () => ({
  startAcTaskNotifications: startNotificationsMock,
  refreshAcTaskNotifications: refreshNotificationsMock
}))

// Not a courtesy stub: the real one resolves the REAL home directory, so `acConnect` below would
// rewrite the developer's own ~/.activecollab-mcp/credentials.json with this file's fixtures.
vi.mock('../activecollab/mcp-install', () => ({
  shareActiveCollabLoginWithMcp: vi.fn()
}))

import {
  acCompleteTask,
  acConnect,
  acDisconnect,
  acPostComment,
  acReopenTask,
  acUpdateTask,
  registerActiveCollabHandlers
} from './activecollab'

const CREDENTIAL = {
  instanceUrl: 'https://projects.efront.com.au',
  userId: 407,
  userName: 'Jake Varrese',
  userEmail: 'jake@efront.com.au',
  token: 'ac-token'
}

const STORE_STUB = {} as unknown as Store

/** The shape ActiveCollab echoes a write back in. */
function taskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    single: {
      id: 5,
      project_id: 3790,
      task_number: 12,
      name: 'Fix the header',
      comments_count: 4,
      updated_on: 1_780_000_000,
      assignee_id: 407,
      ...overrides
    }
  }
}

beforeEach(() => {
  requestMock.mockReset()
  requestMock.mockResolvedValue({ data: taskRow(), totalItems: null, page: null, perPage: null })
  createAcHttpMock.mockReset()
  createAcHttpMock.mockReturnValue({ request: requestMock, requestBinary: vi.fn() })
  getCredentialMock.mockReset()
  getCredentialMock.mockReturnValue(CREDENTIAL)
  getStatusMock.mockReset()
  getStatusMock.mockReturnValue({ connected: false, reason: 'not connected' })
  clearCredentialMock.mockReset()
  connectMock.mockReset()
  resetPreflightMock.mockReset()
  foldMock.mockReset()
  clearSnapshotMock.mockReset()
  startNotificationsMock.mockReset()
  refreshNotificationsMock.mockReset()
  handleMock.mockReset()
})

describe('every write folds its own echo', () => {
  it('folds the echoed row and the due date an edit wrote', async () => {
    const dueOn = new Date(2026, 6, 28).getTime()

    const result = await acUpdateTask({ projectId: 3790, taskId: 5, update: { dueOn } })

    expect(result.ok).toBe(true)
    expect(foldMock).toHaveBeenCalledTimes(1)
    expect(foldMock).toHaveBeenCalledWith({
      taskId: 5,
      task: expect.objectContaining({ id: 5, commentCount: 4 }),
      dueOn
    })
  })

  it('leaves dueOn absent when the edit did not touch it', async () => {
    await acUpdateTask({ projectId: 3790, taskId: 5, update: { name: 'Renamed' } })

    expect(foldMock).toHaveBeenCalledWith({
      taskId: 5,
      task: expect.objectContaining({ id: 5 }),
      dueOn: undefined
    })
  })

  it('folds a completion and a reopen', async () => {
    await acCompleteTask({ taskId: 5 })
    expect(foldMock).toHaveBeenCalledWith({
      taskId: 5,
      task: expect.objectContaining({ id: 5 })
    })

    foldMock.mockClear()
    await acReopenTask({ taskId: 5 })
    expect(foldMock).toHaveBeenCalledWith({
      taskId: 5,
      task: expect.objectContaining({ id: 5 })
    })
  })

  it('folds the comment it just posted, which no echoed row can carry', async () => {
    requestMock.mockResolvedValue({
      data: { single: { id: 99, body: '<p>done</p>', created_on: 1_780_000_000 } },
      totalItems: null,
      page: null,
      perPage: null
    })

    const result = await acPostComment({ taskId: 5, bodyHtml: '<p>done</p>' })

    expect(result.ok).toBe(true)
    expect(foldMock).toHaveBeenCalledWith({ taskId: 5, postedComments: 1 })
  })

  it('folds nothing when the write itself failed', async () => {
    requestMock.mockRejectedValue(new Error('Service Unavailable'))

    expect((await acCompleteTask({ taskId: 5 })).ok).toBe(false)
    expect((await acPostComment({ taskId: 5, bodyHtml: '<p>x</p>' })).ok).toBe(false)
    expect(foldMock).not.toHaveBeenCalled()
  })
})

describe('the notifier lifecycle', () => {
  it('registers with a fetch that reads the caller a page of assigned tasks', async () => {
    registerActiveCollabHandlers(STORE_STUB)

    expect(startNotificationsMock).toHaveBeenCalledWith({
      store: STORE_STUB,
      fetchPage: expect.any(Function)
    })

    requestMock.mockResolvedValue({ data: { tasks: [] }, totalItems: 0, page: 2, perPage: 100 })
    const [registered] = startNotificationsMock.mock.calls[0] as [
      { fetchPage: (page: number) => Promise<{ ok: boolean }> }
    ]
    const { fetchPage } = registered
    expect((await fetchPage(2)).ok).toBe(true)
    expect(requestMock).toHaveBeenCalledWith('users/407/tasks', { query: { page: 2 } })
  })

  it('refreshes on connect, because the new account has its own toggles', async () => {
    connectMock.mockResolvedValue({ ok: true, connection: CREDENTIAL })

    await acConnect({
      instanceUrl: 'https://projects.efront.com.au',
      email: 'jake@efront.com.au',
      password: 'secret'
    })

    expect(refreshNotificationsMock).toHaveBeenCalledTimes(1)
  })

  it('drops the snapshot and stops polling on disconnect', async () => {
    await acDisconnect()

    expect(clearSnapshotMock).toHaveBeenCalledTimes(1)
    expect(refreshNotificationsMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes nothing when a connect attempt is rejected', async () => {
    connectMock.mockResolvedValue({ ok: false, message: 'Invalid username or password' })

    await acConnect({
      instanceUrl: 'https://projects.efront.com.au',
      email: 'jake@efront.com.au',
      password: 'wrong'
    })

    expect(refreshNotificationsMock).not.toHaveBeenCalled()
  })
})
