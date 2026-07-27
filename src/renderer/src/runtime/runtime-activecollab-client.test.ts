// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activeCollabCompleteTask,
  activeCollabConnect,
  activeCollabDisconnect,
  activeCollabGetAttachmentImage,
  activeCollabGetTaskDetail,
  activeCollabListAssignedTasks,
  activeCollabListLabels,
  activeCollabListProjects,
  activeCollabListUsers,
  activeCollabPostComment,
  activeCollabReopenTask,
  activeCollabStatus,
  activeCollabUpdateTask
} from './runtime-activecollab-client'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { TaskSourceContext } from '../../../shared/task-source-context'

const LOCAL = { activeRuntimeEnvironmentId: null }
const REMOTE = { activeRuntimeEnvironmentId: 'env-1' }

const bridge = {
  status: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  listAssignedTasks: vi.fn(),
  listProjects: vi.fn(),
  getTaskDetail: vi.fn(),
  getAttachmentImage: vi.fn(),
  updateTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  postComment: vi.fn(),
  listLabels: vi.fn(),
  listUsers: vi.fn()
}
const runtimeEnvironmentCall = vi.fn<(args: RuntimeEnvironmentCallRequest) => Promise<unknown>>()
const runtimeEnvironmentTransportCall = vi.fn()

function stubWindow(api: Record<string, unknown>): void {
  vi.stubGlobal('window', {
    api: { runtimeEnvironments: { call: runtimeEnvironmentTransportCall }, ...api }
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.resetAllMocks()
  for (const op of Object.values(bridge)) {
    op.mockResolvedValue({ ok: true, value: null })
  }
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  runtimeEnvironmentCall.mockResolvedValue({
    id: 'rpc-1',
    ok: true,
    result: { ok: true, value: null },
    _meta: { runtimeId: 'runtime-1' }
  })
  stubWindow({ activecollab: bridge })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runtime ActiveCollab client local transport', () => {
  it('routes every operation to the preload bridge with no active runtime', async () => {
    const connectArgs = { instanceUrl: 'https://ac.example.com', email: 'a@b.c', password: 'pw' }
    const ref = { projectId: 3790, taskId: 509323 }

    await activeCollabStatus(LOCAL)
    await activeCollabConnect(connectArgs, LOCAL)
    await activeCollabDisconnect(LOCAL)
    await activeCollabListAssignedTasks({ page: 2 }, LOCAL)
    await activeCollabListProjects(LOCAL)
    await activeCollabGetTaskDetail(ref, LOCAL)
    await activeCollabGetAttachmentImage({ attachmentId: 249086 }, LOCAL)
    await activeCollabUpdateTask({ ...ref, update: { dueOn: null } }, LOCAL)
    await activeCollabCompleteTask({ taskId: 509323 }, LOCAL)
    await activeCollabReopenTask({ taskId: 509323 }, LOCAL)
    await activeCollabPostComment({ taskId: 509323, bodyHtml: '<p>Shipped</p>' }, LOCAL)
    await activeCollabListLabels(LOCAL)
    await activeCollabListUsers(LOCAL)

    expect(bridge.status).toHaveBeenCalledWith()
    expect(bridge.connect).toHaveBeenCalledWith(connectArgs)
    expect(bridge.disconnect).toHaveBeenCalledWith()
    expect(bridge.listAssignedTasks).toHaveBeenCalledWith({ page: 2 })
    expect(bridge.listProjects).toHaveBeenCalledWith()
    expect(bridge.getTaskDetail).toHaveBeenCalledWith(ref)
    expect(bridge.getAttachmentImage).toHaveBeenCalledWith({ attachmentId: 249086 })
    expect(bridge.updateTask).toHaveBeenCalledWith({ ...ref, update: { dueOn: null } })
    expect(bridge.completeTask).toHaveBeenCalledWith({ taskId: 509323 })
    expect(bridge.reopenTask).toHaveBeenCalledWith({ taskId: 509323 })
    expect(bridge.postComment).toHaveBeenCalledWith({ taskId: 509323, bodyHtml: '<p>Shipped</p>' })
    expect(bridge.listLabels).toHaveBeenCalledWith()
    expect(bridge.listUsers).toHaveBeenCalledWith()
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('treats omitted settings as local', async () => {
    await activeCollabStatus()

    expect(bridge.status).toHaveBeenCalledWith()
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('forwards an omitted assigned-tasks page as undefined params', async () => {
    await activeCollabListAssignedTasks(undefined, LOCAL)

    expect(bridge.listAssignedTasks).toHaveBeenCalledWith(undefined)
  })
})

describe('runtime ActiveCollab client remote transport', () => {
  it('routes every operation to the matching activecollab RPC method', async () => {
    const connectArgs = { instanceUrl: 'https://ac.example.com', email: 'a@b.c', password: 'pw' }
    const ref = { projectId: 3790, taskId: 509323 }

    await activeCollabStatus(REMOTE)
    await activeCollabConnect(connectArgs, REMOTE)
    await activeCollabDisconnect(REMOTE)
    await activeCollabListAssignedTasks({ page: 2 }, REMOTE)
    await activeCollabListProjects(REMOTE)
    await activeCollabGetTaskDetail(ref, REMOTE)
    await activeCollabGetAttachmentImage({ attachmentId: 249086 }, REMOTE)
    await activeCollabUpdateTask({ ...ref, update: { dueOn: null } }, REMOTE)
    await activeCollabCompleteTask({ taskId: 509323 }, REMOTE)
    await activeCollabReopenTask({ taskId: 509323 }, REMOTE)
    await activeCollabPostComment({ taskId: 509323, bodyHtml: '<p>Shipped</p>' }, REMOTE)
    await activeCollabListLabels(REMOTE)
    await activeCollabListUsers(REMOTE)

    const methods = runtimeEnvironmentCall.mock.calls.map(([args]) => args.method)

    expect(methods).toEqual([
      'activecollab.status',
      'activecollab.connect',
      'activecollab.disconnect',
      'activecollab.listAssignedTasks',
      'activecollab.listProjects',
      'activecollab.getTaskDetail',
      'activecollab.getAttachmentImage',
      'activecollab.updateTask',
      'activecollab.completeTask',
      'activecollab.reopenTask',
      'activecollab.postComment',
      'activecollab.listLabels',
      'activecollab.listUsers'
    ])
    for (const op of Object.values(bridge)) {
      expect(op).not.toHaveBeenCalled()
    }
  })

  it('sends the account timeout for status and the operation timeout for reads', async () => {
    await activeCollabStatus(REMOTE)
    await activeCollabListProjects(REMOTE)

    expect(runtimeEnvironmentCall).toHaveBeenNthCalledWith(1, {
      selector: 'env-1',
      method: 'activecollab.status',
      params: undefined,
      timeoutMs: 15_000
    })
    expect(runtimeEnvironmentCall).toHaveBeenNthCalledWith(2, {
      selector: 'env-1',
      method: 'activecollab.listProjects',
      params: undefined,
      timeoutMs: 30_000
    })
  })

  it('resolves the runtime environment from a task source context host id', async () => {
    const context: TaskSourceContext = {
      kind: 'task-source',
      provider: 'activecollab',
      projectId: '3790',
      hostId: toRuntimeExecutionHostId('env-1')
    }

    await activeCollabListLabels(context)

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith(
      expect.objectContaining({ selector: 'env-1', method: 'activecollab.listLabels' })
    )
    expect(bridge.listLabels).not.toHaveBeenCalled()
  })
})

describe('runtime ActiveCollab client failure handling', () => {
  it('passes a well-formed failure from below through unchanged', async () => {
    const failure = { ok: false, kind: 'auth', error: 'Token rejected.', status: 401 } as const
    bridge.listProjects.mockResolvedValue(failure)

    await expect(activeCollabListProjects(LOCAL)).resolves.toEqual(failure)
  })

  it('passes a well-formed remote failure through without re-wrapping', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: { ok: false, kind: 'not-configured', error: 'No token.', status: null },
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(activeCollabListProjects(REMOTE)).resolves.toEqual({
      ok: false,
      kind: 'not-configured',
      error: 'No token.',
      status: null
    })
  })

  it('converts a rejecting local bridge into an unknown failure', async () => {
    bridge.getTaskDetail.mockRejectedValue(new Error('socket hang up'))

    await expect(activeCollabGetTaskDetail({ projectId: 1, taskId: 2 }, LOCAL)).resolves.toEqual({
      ok: false,
      kind: 'unknown',
      error: 'socket hang up',
      status: null
    })
  })

  it('converts a throwing local bridge into an unknown failure', async () => {
    bridge.completeTask.mockImplementation(() => {
      throw new Error('bridge exploded')
    })

    await expect(activeCollabCompleteTask({ taskId: 7 }, LOCAL)).resolves.toEqual({
      ok: false,
      kind: 'unknown',
      error: 'bridge exploded',
      status: null
    })
  })

  it('converts a missing preload bridge into an unknown failure', async () => {
    stubWindow({})

    const result = await activeCollabStatus(LOCAL)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.kind).toBe('unknown')
  })

  it('converts a runtime RPC error envelope into an unknown failure', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: false,
      error: { code: 'timeout', message: 'Runtime call timed out.' },
      _meta: { runtimeId: 'runtime-1' }
    })

    await expect(activeCollabListLabels(REMOTE)).resolves.toEqual({
      ok: false,
      kind: 'unknown',
      error: 'Runtime call timed out.',
      status: null
    })
  })

  it('converts a malformed response into an unknown failure instead of leaking it', async () => {
    bridge.listLabels.mockResolvedValue(undefined)

    await expect(activeCollabListLabels(LOCAL)).resolves.toEqual({
      ok: false,
      kind: 'unknown',
      error: 'activecollab.listLabels returned a malformed response.',
      status: null
    })
  })
})
