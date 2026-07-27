import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabConnectionStatus } from '../../shared/activecollab-types'
import type * as ActiveCollabHttp from '../activecollab/http'

const {
  handleMock,
  removeHandlerMock,
  requestMock,
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
  createAcHttpMock: vi.fn(),
  getCredentialMock: vi.fn(),
  getStatusMock: vi.fn(),
  clearCredentialMock: vi.fn(),
  connectMock: vi.fn(),
  resetPreflightMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
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

import { ActiveCollabApiError } from '../activecollab/http'
import { registerActiveCollabHandlers } from './activecollab'

const CHANNELS = [
  'activecollab:status',
  'activecollab:connect',
  'activecollab:disconnect',
  'activecollab:listAssignedTasks',
  'activecollab:listProjects',
  'activecollab:getTaskDetail',
  'activecollab:updateTask',
  'activecollab:completeTask',
  'activecollab:reopenTask',
  'activecollab:postComment',
  'activecollab:listLabels'
]

/** Every channel that needs a stored credential, so one loop can prove the whole surface. */
const CREDENTIALLED_CHANNELS: { channel: string; args: unknown }[] = [
  { channel: 'activecollab:listAssignedTasks', args: undefined },
  { channel: 'activecollab:listProjects', args: undefined },
  { channel: 'activecollab:getTaskDetail', args: { projectId: 3790, taskId: 509323 } },
  {
    channel: 'activecollab:updateTask',
    args: { projectId: 3790, taskId: 509323, update: { name: 'Renamed' } }
  },
  { channel: 'activecollab:completeTask', args: { taskId: 509323 } },
  { channel: 'activecollab:reopenTask', args: { taskId: 509323 } },
  { channel: 'activecollab:postComment', args: { taskId: 509323, bodyHtml: '<p>Hi</p>' } },
  { channel: 'activecollab:listLabels', args: undefined }
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
  return (call[1] as Handler)(null, args)
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
  createAcHttpMock.mockReset()
  createAcHttpMock.mockReturnValue({ request: requestMock })
  getCredentialMock.mockReset()
  getCredentialMock.mockReturnValue(CREDENTIAL)
  getStatusMock.mockReset()
  getStatusMock.mockReturnValue(CONNECTED_STATUS)
  clearCredentialMock.mockReset()
  connectMock.mockReset()
  resetPreflightMock.mockReset()
  registerActiveCollabHandlers()
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
    { name: 'non-numeric page', channel: 'activecollab:listAssignedTasks', args: { page: 'two' } }
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
