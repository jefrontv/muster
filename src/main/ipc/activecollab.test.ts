import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabConnectionStatus } from '../../shared/activecollab-types'
import type * as ActiveCollabHttp from '../activecollab/http'

const {
  handleMock,
  removeHandlerMock,
  requestMock,
  requestBinaryMock,
  createAcHttpMock,
  getCredentialMock,
  getStatusMock,
  clearCredentialMock,
  connectMock,
  resetPreflightMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  requestMock: vi.fn(),
  requestBinaryMock: vi.fn(),
  createAcHttpMock: vi.fn(),
  getCredentialMock: vi.fn(),
  getStatusMock: vi.fn(),
  clearCredentialMock: vi.fn(),
  connectMock: vi.fn(),
  resetPreflightMock: vi.fn()
}))

// `dialog`/`shell`/`app` exist only because the download op imports them; every assertion here
// stops at the credential check, before a save dialog could open.
vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
  app: { getPath: () => '/tmp/downloads' },
  dialog: { showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  BrowserWindow: { fromWebContents: () => null }
}))

// The error class stays real: the failure mapping branches on `instanceof` and on `isAuthError`,
// so a fake would prove nothing about how a rejected token reaches the renderer.
vi.mock('../activecollab/http', async (importOriginal) => {
  const actual = await importOriginal<typeof ActiveCollabHttp>()
  return { ...actual, createAcHttp: createAcHttpMock }
})

// Mocked wholesale so no keychain, no safeStorage and no credential file are touched.
vi.mock('../activecollab/credential-store', () => ({
  getActiveCollabCredential: getCredentialMock,
  getActiveCollabConnectionStatus: getStatusMock,
  clearActiveCollabCredential: clearCredentialMock
}))

vi.mock('../activecollab/auth', () => ({ connectActiveCollab: connectMock }))

vi.mock('./preflight', () => ({ _resetPreflightCache: resetPreflightMock }))

// The notifier is proved in activecollab-write-echo.test.ts. Stubbed here so this file's module
// graph stays clear of the notification stack, which pulls in the tray, sound assets and a window.
vi.mock('../activecollab/task-notification-service', () => ({
  startAcTaskNotifications: vi.fn(),
  refreshAcTaskNotifications: vi.fn()
}))

vi.mock('../activecollab/task-snapshot-store', () => ({
  acClearTaskSnapshot: vi.fn(),
  acFoldLocalTaskWrite: vi.fn()
}))

import { AC_MAX_ATTACHMENT_IMAGE_BYTES } from '../activecollab/attachment-image'
import { ActiveCollabApiError } from '../activecollab/http'
import { resetAcNameDirectoryCache } from '../activecollab/name-directory'
import { resetAcProjectMembersCache } from '../activecollab/project-members'
import { registerActiveCollabHandlers } from './activecollab'
import type { Store } from '../persistence'

/** Registration only hands the store to the (stubbed) notifier, so it needs no real state. */
const STORE_STUB = {} as unknown as Store

const CHANNELS = [
  'activecollab:status',
  'activecollab:connect',
  'activecollab:disconnect',
  'activecollab:listAssignedTasks',
  'activecollab:listProjects',
  'activecollab:getTaskDetail',
  'activecollab:getAttachmentImage',
  'activecollab:downloadAttachment',
  'activecollab:pickCommentAttachments',
  'activecollab:describeCommentAttachments',
  'activecollab:uploadCommentAttachments',
  'activecollab:updateTask',
  'activecollab:completeTask',
  'activecollab:reopenTask',
  'activecollab:postComment',
  'activecollab:listLabels',
  'activecollab:listUsers',
  'activecollab:listProjectMembers',
  // Unread is credential-free: the counts are a file this machine's poller maintains, so these
  // two are deliberately absent from CREDENTIALLED_CHANNELS below.
  'activecollab:unread',
  'activecollab:markTaskRead'
]

/** Every channel that needs a stored credential, so one loop can prove the whole surface. */
const CREDENTIALLED_CHANNELS: { channel: string; args: unknown }[] = [
  { channel: 'activecollab:listAssignedTasks', args: undefined },
  { channel: 'activecollab:listProjects', args: undefined },
  { channel: 'activecollab:getTaskDetail', args: { projectId: 3790, taskId: 509323 } },
  { channel: 'activecollab:getAttachmentImage', args: { attachmentId: 249086 } },
  {
    channel: 'activecollab:downloadAttachment',
    args: { attachmentId: 249087, name: 'brief.pdf' }
  },
  { channel: 'activecollab:pickCommentAttachments', args: undefined },
  {
    channel: 'activecollab:uploadCommentAttachments',
    args: { paths: ['/tmp/ac.png'] }
  },
  {
    channel: 'activecollab:updateTask',
    args: { projectId: 3790, taskId: 509323, update: { name: 'Renamed' } }
  },
  { channel: 'activecollab:completeTask', args: { taskId: 509323 } },
  { channel: 'activecollab:reopenTask', args: { taskId: 509323 } },
  { channel: 'activecollab:postComment', args: { taskId: 509323, bodyHtml: '<p>Hi</p>' } },
  { channel: 'activecollab:listLabels', args: undefined },
  { channel: 'activecollab:listUsers', args: undefined },
  { channel: 'activecollab:listProjectMembers', args: { projectId: 5937 } }
]

const CREDENTIAL = {
  instanceUrl: 'https://projects.example.com',
  token: 'tok-abc',
  userId: 42,
  userName: 'Jake',
  userEmail: 'jake@example.com'
}

const CONNECTED_STATUS: ActiveCollabConnectionStatus = {
  configured: true,
  connection: {
    instanceUrl: CREDENTIAL.instanceUrl,
    userId: CREDENTIAL.userId,
    userName: CREDENTIAL.userName,
    userEmail: CREDENTIAL.userEmail
  },
  reason: ''
}

const NOT_CONFIGURED_STATUS: ActiveCollabConnectionStatus = {
  configured: false,
  connection: null,
  reason: 'ActiveCollab is not connected. Add your instance URL and sign in to connect.'
}

const TASK_ROW = {
  id: 509323,
  project_id: 3790,
  project_name: 'Website Rebuild',
  task_number: 42,
  name: 'Fix the header',
  body: '<p>Header is broken</p>',
  is_completed: false,
  due_on: 1785110400,
  assignee_id: 0,
  labels: [],
  comments_count: 0,
  url_path: '/projects/3790/tasks/509323',
  task_list_id: 0
}

type Handler = (event: unknown, args?: unknown) => Promise<unknown>

function invoke(channel: string, args?: unknown): Promise<unknown> {
  const call = handleMock.mock.calls.find(([name]) => name === channel)
  if (!call) {
    throw new Error(`No handler registered for ${channel}`)
  }
  // A real ipcMain handler always gets an event; the download op reads `sender` off it.
  return (call[1] as Handler)({ sender: undefined }, args)
}

/** Narrowed so a failing assertion reports the tagged failure instead of "undefined". */
function failureOf(result: unknown): { kind: string; error: string; status: number | null } {
  const tagged = result as ActiveCollabResult<unknown>
  if (tagged.ok) {
    throw new Error(`Expected a failure, got ${JSON.stringify(tagged)}`)
  }
  return { kind: tagged.kind, error: tagged.error, status: tagged.status }
}

function lastRequest(): { path: string; options?: { method?: string; body?: unknown } } {
  const call = requestMock.mock.calls.at(-1)
  return { path: call?.[0] as string, options: call?.[1] as { method?: string; body?: unknown } }
}

beforeEach(() => {
  handleMock.mockReset()
  removeHandlerMock.mockReset()
  requestMock.mockReset()
  requestMock.mockResolvedValue({ data: {}, totalItems: null, page: null, perPage: null })
  requestBinaryMock.mockReset()
  requestBinaryMock.mockResolvedValue({
    ok: true,
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3])
  })
  createAcHttpMock.mockReset()
  createAcHttpMock.mockReturnValue({ request: requestMock, requestBinary: requestBinaryMock })
  getCredentialMock.mockReset()
  getCredentialMock.mockReturnValue(CREDENTIAL)
  getStatusMock.mockReset()
  getStatusMock.mockReturnValue(CONNECTED_STATUS)
  clearCredentialMock.mockReset()
  connectMock.mockReset()
  resetPreflightMock.mockReset()
  // Module-level and credential-keyed by design, so each test starts from a cold directory.
  resetAcNameDirectoryCache()
  resetAcProjectMembersCache()
  registerActiveCollabHandlers(STORE_STUB)
})

describe('registerActiveCollabHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double up', () => {
    for (const channel of CHANNELS) {
      expect(removeHandlerMock).toHaveBeenCalledWith(channel)
      expect(handleMock.mock.calls.filter(([name]) => name === channel)).toHaveLength(1)
    }
  })

  it('registers exactly the allowlisted channels and nothing else', () => {
    expect(handleMock.mock.calls.map(([name]) => name).sort()).toEqual([...CHANNELS].sort())
  })
})

describe('missing credential', () => {
  it('answers a tagged not-configured failure on every credentialled channel', async () => {
    getCredentialMock.mockReturnValue(null)
    getStatusMock.mockReturnValue(NOT_CONFIGURED_STATUS)
    for (const { channel, args } of CREDENTIALLED_CHANNELS) {
      const failure = failureOf(await invoke(channel, args))
      expect(failure.kind, channel).toBe('not-configured')
      expect(failure.error, channel).toBe(NOT_CONFIGURED_STATUS.reason)
      expect(failure.status, channel).toBeNull()
    }
    expect(createAcHttpMock).not.toHaveBeenCalled()
  })

  it('never throws when the keychain refuses the stored ciphertext', async () => {
    getCredentialMock.mockImplementation(() => {
      throw new Error('keychain refused decryption')
    })
    getStatusMock.mockReturnValue({
      configured: false,
      connection: null,
      reason: 'ActiveCollab credential could not be read.'
    })
    const failure = failureOf(await invoke('activecollab:listProjects'))
    expect(failure.kind).toBe('not-configured')
    expect(failure.error).toBe('ActiveCollab credential could not be read.')
  })

  it('still answers status, because the settings pane renders "not connected"', async () => {
    getCredentialMock.mockReturnValue(null)
    getStatusMock.mockReturnValue(NOT_CONFIGURED_STATUS)
    await expect(invoke('activecollab:status')).resolves.toEqual({
      ok: true,
      value: NOT_CONFIGURED_STATUS
    })
  })
})

describe('argument validation', () => {
  const rejected: { name: string; channel: string; args: unknown }[] = [
    { name: 'zero task id', channel: 'activecollab:completeTask', args: { taskId: 0 } },
    { name: 'negative task id', channel: 'activecollab:reopenTask', args: { taskId: -1 } },
    { name: 'fractional task id', channel: 'activecollab:completeTask', args: { taskId: 1.5 } },
    { name: 'string task id', channel: 'activecollab:completeTask', args: { taskId: '509323' } },
    { name: 'missing args entirely', channel: 'activecollab:getTaskDetail', args: undefined },
    {
      name: 'zero project id',
      channel: 'activecollab:getTaskDetail',
      args: { projectId: 0, taskId: 509323 }
    },
    {
      name: 'over-long comment body',
      channel: 'activecollab:postComment',
      args: { taskId: 509323, bodyHtml: 'x'.repeat(65_537) }
    },
    {
      name: 'blank comment body',
      channel: 'activecollab:postComment',
      args: { taskId: 509323, bodyHtml: '   ' }
    },
    {
      name: 'over-long task name',
      channel: 'activecollab:updateTask',
      args: { projectId: 3790, taskId: 509323, update: { name: 'x'.repeat(513) } }
    },
    {
      name: 'empty update',
      channel: 'activecollab:updateTask',
      args: { projectId: 3790, taskId: 509323, update: {} }
    },
    {
      name: 'non-array labelNames',
      channel: 'activecollab:updateTask',
      args: { projectId: 3790, taskId: 509323, update: { labelNames: 'Deferred' } }
    },
    {
      name: 'non-string label entry',
      channel: 'activecollab:updateTask',
      args: { projectId: 3790, taskId: 509323, update: { labelNames: [7] } }
    },
    {
      name: 'non-numeric dueOn',
      channel: 'activecollab:updateTask',
      args: { projectId: 3790, taskId: 509323, update: { dueOn: '2026-07-27' } }
    },
    { name: 'non-numeric page', channel: 'activecollab:listAssignedTasks', args: { page: 'two' } },
    {
      name: 'zero attachment id',
      channel: 'activecollab:getAttachmentImage',
      args: { attachmentId: 0 }
    },
    { name: 'missing attachment id', channel: 'activecollab:getAttachmentImage', args: {} }
  ]

  for (const { name, channel, args } of rejected) {
    it(`rejects ${name} before any HTTP call`, async () => {
      const failure = failureOf(await invoke(channel, args))
      expect(failure.kind).toBe('invalid-request')
      expect(createAcHttpMock).not.toHaveBeenCalled()
      expect(requestMock).not.toHaveBeenCalled()
    })
  }

  it('clamps a page below 1 rather than failing a stale list', async () => {
    await invoke('activecollab:listAssignedTasks', { page: 0 })
    expect(lastRequest()).toMatchObject({ path: 'users/42/tasks', options: { query: { page: 1 } } })
  })

  it('addresses the connected user, not a renderer-supplied id', async () => {
    await invoke('activecollab:listAssignedTasks', { page: 3, userId: 999 })
    expect(lastRequest().path).toBe('users/42/tasks')
  })
})

describe('write payloads', () => {
  it('sends a due date as "YYYY-MM-DD" and an explicit null to clear it', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'Australia/Sydney'
    try {
      await invoke('activecollab:updateTask', {
        projectId: 3790,
        taskId: 509323,
        // Local midnight on 2026-07-27 in Sydney, which is still the 26th in UTC.
        update: { dueOn: Date.parse('2026-07-26T14:00:00Z') }
      })
      expect(lastRequest()).toMatchObject({
        path: 'projects/3790/tasks/509323',
        options: { method: 'PUT', body: { due_on: '2026-07-27' } }
      })
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ
      } else {
        process.env.TZ = originalTz
      }
    }

    await invoke('activecollab:updateTask', {
      projectId: 3790,
      taskId: 509323,
      update: { dueOn: null }
    })
    expect(lastRequest().options?.body).toEqual({ due_on: null })
  })

  it('sends labelNames as a full replacement array of strings', async () => {
    await invoke('activecollab:updateTask', {
      projectId: 3790,
      taskId: 509323,
      update: { labelNames: ['Deferred', 'Blocked'] }
    })
    expect(lastRequest().options?.body).toEqual({ labels: ['Deferred', 'Blocked'] })
  })

  it('drops unknown keys instead of forwarding untrusted JSON into the PUT', async () => {
    await invoke('activecollab:updateTask', {
      projectId: 3790,
      taskId: 509323,
      update: { name: 'Renamed', is_hidden_from_clients: true, priority: 9 }
    })
    expect(lastRequest().options?.body).toEqual({ name: 'Renamed' })
  })

  it('builds the client from the stored credential on every call', async () => {
    await invoke('activecollab:listProjects')
    expect(createAcHttpMock).toHaveBeenCalledWith({
      baseUrl: CREDENTIAL.instanceUrl,
      token: CREDENTIAL.token
    })
  })

  it('returns the normalised row a write echoed back', async () => {
    requestMock.mockResolvedValue({
      data: { single: { ...TASK_ROW, is_completed: true } },
      totalItems: null,
      page: null,
      perPage: null
    })
    await expect(invoke('activecollab:completeTask', { taskId: 509323 })).resolves.toMatchObject({
      ok: true,
      value: { id: 509323, isCompleted: true }
    })
    expect(lastRequest()).toEqual({
      path: 'complete/task/509323',
      options: { method: 'PUT' }
    })
  })
})

describe('failure kinds', () => {
  it('tags an auth error distinctly, so the UI can prompt a reconnect', async () => {
    requestMock.mockRejectedValue(new ActiveCollabApiError('Token expired', 401, true))
    const failure = failureOf(await invoke('activecollab:listProjects'))
    expect(failure).toEqual({ kind: 'auth', error: 'Token expired', status: 401 })
  })

  it('tags a non-auth API fault separately, so a 503 is not a reconnect prompt', async () => {
    requestMock.mockRejectedValue(new ActiveCollabApiError('Service unavailable', 503, false))
    const failure = failureOf(await invoke('activecollab:listProjects'))
    expect(failure).toEqual({ kind: 'api', error: 'Service unavailable', status: 503 })
  })

  it('tags anything else as unknown rather than letting it reject across the bridge', async () => {
    requestMock.mockRejectedValue(new Error('socket hang up'))
    const failure = failureOf(await invoke('activecollab:listProjects'))
    expect(failure).toEqual({ kind: 'unknown', error: 'socket hang up', status: null })
  })
})

describe('name resolution', () => {
  // What the wire actually sends: neither name, on either endpoint. Verified against
  // ActiveCollab 8.0.31, where 0 of 11 assigned rows carried `project_name` or `assignee_name`.
  const NAMELESS_ROW = { ...TASK_ROW, project_name: undefined, assignee_id: 407 }

  function serveDirectory(taskPayload: unknown): void {
    requestMock.mockImplementation(async (path: string) => {
      const data =
        path === 'projects'
          ? [{ id: 3790, name: 'Website Rebuild' }]
          : path === 'users'
            ? { users: [{ id: 407, display_name: 'Jake Varrese' }] }
            : taskPayload
      return { data, totalItems: null, page: null, perPage: null }
    })
  }

  function pathCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const [path] of requestMock.mock.calls) {
      counts[path as string] = (counts[path as string] ?? 0) + 1
    }
    return counts
  }

  it('fills in both names the list view renders', async () => {
    serveDirectory({ tasks: [NAMELESS_ROW] })

    const result = await invoke('activecollab:listAssignedTasks')

    expect(result).toMatchObject({
      ok: true,
      value: { tasks: [{ projectName: 'Website Rebuild', assigneeName: 'Jake Varrese' }] }
    })
  })

  it('fills in both names on the detail pane that used to read "Unassigned"', async () => {
    serveDirectory({ single: NAMELESS_ROW })

    const result = await invoke('activecollab:getTaskDetail', { projectId: 3790, taskId: 509323 })

    expect(result).toMatchObject({
      ok: true,
      value: {
        task: { projectName: 'Website Rebuild', assigneeId: 407, assigneeName: 'Jake Varrese' }
      }
    })
  })

  it('fills in both names on the row a write echoes back into the caches', async () => {
    serveDirectory({ single: NAMELESS_ROW })

    const result = await invoke('activecollab:completeTask', { taskId: 509323 })

    expect(result).toMatchObject({
      ok: true,
      value: { projectName: 'Website Rebuild', assigneeName: 'Jake Varrese' }
    })
  })

  it('reads each collection once across a page of rows and a follow-up detail call', async () => {
    serveDirectory({
      tasks: Array.from({ length: 40 }, (_, i) => ({ ...NAMELESS_ROW, id: i + 1 }))
    })

    await invoke('activecollab:listAssignedTasks')
    await invoke('activecollab:getTaskDetail', { projectId: 3790, taskId: 509323 })

    expect(pathCounts()).toMatchObject({ projects: 1, users: 1 })
  })

  it('reads each collection once when two operations run concurrently', async () => {
    serveDirectory({ tasks: [NAMELESS_ROW] })

    await Promise.all([
      invoke('activecollab:listAssignedTasks'),
      invoke('activecollab:listAssignedTasks', { page: 2 })
    ])

    expect(pathCounts()).toMatchObject({ projects: 1, users: 1, 'users/42/tasks': 2 })
  })

  it('serves the @mention roster off the same window, so no second /users read happens', async () => {
    serveDirectory({ tasks: [NAMELESS_ROW] })

    // The order a real session takes: open the list, then type `@` in the comment composer.
    await invoke('activecollab:listAssignedTasks')
    await invoke('activecollab:listUsers')
    await invoke('activecollab:listUsers')

    expect(pathCounts()).toMatchObject({ users: 1 })
  })

  it('answers listUsers with id-and-name rows, sorted, and nothing else about the person', async () => {
    requestMock.mockImplementation(async (path: string) => ({
      data:
        path === 'users'
          ? {
              users: [
                { id: 407, display_name: 'Jake Varrese', email: 'jake@example.com' },
                { id: 12, display_name: 'Ada Lovelace', email: 'ada@example.com' }
              ]
            }
          : [],
      totalItems: null,
      page: null,
      perPage: null
    }))

    await expect(invoke('activecollab:listUsers')).resolves.toEqual({
      ok: true,
      value: [
        { id: 12, name: 'Ada Lovelace' },
        { id: 407, name: 'Jake Varrese' }
      ]
    })
  })

  it('answers an empty roster rather than a failure when /users is refused', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path === 'users') {
        throw new ActiveCollabApiError('Access denied', 403, true)
      }
      return { data: [], totalItems: null, page: null, perPage: null }
    })

    // A mention menu with nobody in it is a dead menu; a reconnect prompt over a comment box is a
    // lie about the connection, which is still live for every other operation.
    await expect(invoke('activecollab:listUsers')).resolves.toEqual({ ok: true, value: [] })
  })

  it('answers listProjectMembers with only the project people, named off the same roster', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path === 'users') {
        return {
          data: {
            users: [
              { id: 407, display_name: 'Jake Varrese' },
              { id: 12, display_name: 'Ada Lovelace' },
              { id: 88, display_name: 'Alan Turing' }
            ]
          },
          totalItems: null,
          page: null,
          perPage: null
        }
      }
      // The verified 8.0.31 envelope: bare user ids under `single.members`.
      const data = path === 'projects/5937' ? { single: { members: [12, 407] } } : []
      return { data, totalItems: null, page: null, perPage: null }
    })

    // Alan is on the instance but not on the project, so he must not be offered.
    await expect(invoke('activecollab:listProjectMembers', { projectId: 5937 })).resolves.toEqual({
      ok: true,
      value: [
        { id: 12, name: 'Ada Lovelace' },
        { id: 407, name: 'Jake Varrese' }
      ]
    })
  })

  it('reads a project membership once per project, and reuses the already-warm roster', async () => {
    requestMock.mockImplementation(async (path: string) => {
      const data =
        path === 'users'
          ? { users: [{ id: 407, display_name: 'Jake Varrese' }] }
          : path.startsWith('projects/')
            ? { single: { members: [407] } }
            : []
      return { data, totalItems: null, page: null, perPage: null }
    })

    await Promise.all([
      invoke('activecollab:listProjectMembers', { projectId: 5937 }),
      invoke('activecollab:listProjectMembers', { projectId: 5937 })
    ])
    await invoke('activecollab:listProjectMembers', { projectId: 5937 })
    await invoke('activecollab:listProjectMembers', { projectId: 3790 })

    // One read per project per window, however many callers; the roster is paid for exactly once.
    expect(pathCounts()).toMatchObject({ 'projects/5937': 1, 'projects/3790': 1, users: 1 })
  })

  it('answers an empty membership rather than a failure when the project read is refused', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('projects/')) {
        throw new ActiveCollabApiError('Access denied', 403, true)
      }
      const data = path === 'users' ? { users: [{ id: 407, display_name: 'Jake' }] } : []
      return { data, totalItems: null, page: null, perPage: null }
    })

    // Empty is the renderer's cue to offer the whole roster. A tagged failure would instead put a
    // reconnect prompt over a comment box whose connection is fine.
    await expect(invoke('activecollab:listProjectMembers', { projectId: 5937 })).resolves.toEqual({
      ok: true,
      value: []
    })
  })

  it('still answers the tasks when the roster read fails', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path === 'users') {
        throw new ActiveCollabApiError('Access denied', 403, true)
      }
      const data =
        path === 'projects' ? [{ id: 3790, name: 'Website Rebuild' }] : { tasks: [NAMELESS_ROW] }
      return { data, totalItems: null, page: null, perPage: null }
    })

    const result = await invoke('activecollab:listAssignedTasks')

    // An admin-gated roster must not become a reconnect prompt over a list that loaded fine.
    expect(result).toMatchObject({
      ok: true,
      value: { tasks: [{ projectName: 'Website Rebuild', assigneeId: 407, assigneeName: null }] }
    })
  })

  it('still answers the tasks when the project read fails', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path === 'projects') {
        throw new ActiveCollabApiError('Service unavailable', 503, false)
      }
      const data =
        path === 'users'
          ? { users: [{ id: 407, display_name: 'Jake Varrese' }] }
          : { tasks: [NAMELESS_ROW] }
      return { data, totalItems: null, page: null, perPage: null }
    })

    const result = await invoke('activecollab:listAssignedTasks')

    expect(result).toMatchObject({
      ok: true,
      value: { tasks: [{ projectName: '', assigneeName: 'Jake Varrese' }] }
    })
  })

  it('clears the directory on disconnect, so the next account gets its own names', async () => {
    serveDirectory({ tasks: [NAMELESS_ROW] })
    await invoke('activecollab:listAssignedTasks')

    await invoke('activecollab:disconnect')
    await invoke('activecollab:listAssignedTasks')

    expect(pathCounts()).toMatchObject({ projects: 2, users: 2 })
  })
})

describe('attachment images', () => {
  it('answers a data URL built in main, with the token nowhere in it', async () => {
    const result = await invoke('activecollab:getAttachmentImage', { attachmentId: 249087 })

    expect(result).toEqual({
      ok: true,
      value: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png' }
    })
    // The renderer gets bytes, never a credentialled URL.
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL.token)
    const [path, options] = requestBinaryMock.mock.calls[0]
    expect(path).toBe('attachments/249087/download')
    expect(options.maxBytes).toBe(AC_MAX_ATTACHMENT_IMAGE_BYTES)
  })

  it('refuses a non-image as invalid-request, not as a reconnect prompt or a retryable fault', async () => {
    requestBinaryMock.mockResolvedValue({
      ok: false,
      reason: 'unsupported-media',
      mimeType: 'application/pdf'
    })

    const failure = failureOf(await invoke('activecollab:getAttachmentImage', { attachmentId: 7 }))

    expect(failure.kind).toBe('invalid-request')
    expect(failure.error).toContain('application/pdf')
  })

  it('refuses an oversized attachment as invalid-request', async () => {
    requestBinaryMock.mockResolvedValue({ ok: false, reason: 'too-large' })

    const failure = failureOf(await invoke('activecollab:getAttachmentImage', { attachmentId: 8 }))

    expect(failure.kind).toBe('invalid-request')
    expect(failure.error).toContain('inline limit')
  })

  it('still tags a rejected token as auth so the UI prompts a reconnect', async () => {
    requestBinaryMock.mockRejectedValue(new ActiveCollabApiError('Token expired', 401, true))

    const failure = failureOf(await invoke('activecollab:getAttachmentImage', { attachmentId: 9 }))

    expect(failure).toEqual({ kind: 'auth', error: 'Token expired', status: 401 })
  })
})

describe('connect and disconnect', () => {
  it('stores the connection and resets the cached preflight result', async () => {
    connectMock.mockResolvedValue({ ok: true, connection: CONNECTED_STATUS.connection })
    await expect(
      invoke('activecollab:connect', {
        instanceUrl: ' https://projects.example.com ',
        email: ' jake@example.com ',
        password: ' pa ss '
      })
    ).resolves.toEqual({ ok: true, value: CONNECTED_STATUS.connection })
    expect(connectMock).toHaveBeenCalledWith({
      baseUrl: 'https://projects.example.com',
      email: 'jake@example.com',
      // Untrimmed on purpose: spaces are legal in a password.
      password: ' pa ss '
    })
    expect(resetPreflightMock).toHaveBeenCalledTimes(1)
  })

  it('reports rejected credentials as an auth failure with the API\u2019s own message', async () => {
    connectMock.mockResolvedValue({ ok: false, message: 'Invalid username or password' })
    const failure = failureOf(
      await invoke('activecollab:connect', {
        instanceUrl: 'https://projects.example.com',
        email: 'jake@example.com',
        password: 'wrong'
      })
    )
    expect(failure).toEqual({ kind: 'auth', error: 'Invalid username or password', status: null })
    expect(resetPreflightMock).not.toHaveBeenCalled()
  })

  it('rejects an incomplete connect form without attempting a sign-in', async () => {
    const failure = failureOf(
      await invoke('activecollab:connect', { instanceUrl: '  ', email: '', password: '' })
    )
    expect(failure.kind).toBe('invalid-request')
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('rejects an over-long instance URL', async () => {
    const failure = failureOf(
      await invoke('activecollab:connect', {
        instanceUrl: `https://${'x'.repeat(2_048)}`,
        email: 'jake@example.com',
        password: 'pw'
      })
    )
    expect(failure.kind).toBe('invalid-request')
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('clears the credential, resets preflight, and answers the post-clear status', async () => {
    getStatusMock.mockReturnValue(NOT_CONFIGURED_STATUS)
    await expect(invoke('activecollab:disconnect')).resolves.toEqual({
      ok: true,
      value: NOT_CONFIGURED_STATUS
    })
    expect(clearCredentialMock).toHaveBeenCalledTimes(1)
    expect(resetPreflightMock).toHaveBeenCalledTimes(1)
  })
})
