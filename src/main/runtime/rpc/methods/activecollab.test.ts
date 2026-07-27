import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest, RpcResponse } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { ACTIVECOLLAB_METHODS } from './activecollab'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

/** Narrowed off the RpcResponse union so a regression reports the failure, not "undefined". */
function errorOf(response: RpcResponse): { code: string; message: string } {
  if (response.ok) {
    throw new Error(`Expected a failure, got ${JSON.stringify(response)}`)
  }
  return { code: response.error.code, message: response.error.message }
}

function makeRuntime(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    activeCollabStatus: vi.fn(),
    activeCollabConnect: vi.fn(),
    activeCollabDisconnect: vi.fn(),
    activeCollabListAssignedTasks: vi.fn(),
    activeCollabListProjects: vi.fn(),
    activeCollabGetTaskDetail: vi.fn(),
    activeCollabUpdateTask: vi.fn(),
    activeCollabCompleteTask: vi.fn(),
    activeCollabReopenTask: vi.fn(),
    activeCollabPostComment: vi.fn(),
    activeCollabListLabels: vi.fn()
  } as unknown as OrcaRuntimeService
}

describe('activecollab RPC methods', () => {
  it('routes the account methods to the runtime server', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ACTIVECOLLAB_METHODS })

    await dispatcher.dispatch(makeRequest('activecollab.status'))
    await dispatcher.dispatch(
      makeRequest('activecollab.connect', {
        instanceUrl: 'https://projects.example.com',
        email: 'jake@example.com',
        password: 'pw'
      })
    )
    await dispatcher.dispatch(makeRequest('activecollab.disconnect'))

    expect(runtime.activeCollabStatus).toHaveBeenCalled()
    expect(runtime.activeCollabConnect).toHaveBeenCalledWith({
      instanceUrl: 'https://projects.example.com',
      email: 'jake@example.com',
      password: 'pw'
    })
    expect(runtime.activeCollabDisconnect).toHaveBeenCalled()
  })

  it('routes the reads to the runtime server, with page optional', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ACTIVECOLLAB_METHODS })

    await dispatcher.dispatch(makeRequest('activecollab.listAssignedTasks'))
    await dispatcher.dispatch(makeRequest('activecollab.listAssignedTasks', { page: 2 }))
    await dispatcher.dispatch(makeRequest('activecollab.listProjects'))
    await dispatcher.dispatch(
      makeRequest('activecollab.getTaskDetail', { projectId: 3790, taskId: 509323 })
    )
    await dispatcher.dispatch(makeRequest('activecollab.listLabels'))

    expect(runtime.activeCollabListAssignedTasks).toHaveBeenNthCalledWith(2, { page: 2 })
    expect(runtime.activeCollabListProjects).toHaveBeenCalled()
    expect(runtime.activeCollabGetTaskDetail).toHaveBeenCalledWith({
      projectId: 3790,
      taskId: 509323
    })
    expect(runtime.activeCollabListLabels).toHaveBeenCalled()
  })

  it('routes the writes, preserving a null that clears a field', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ACTIVECOLLAB_METHODS })

    await dispatcher.dispatch(
      makeRequest('activecollab.updateTask', {
        projectId: 3790,
        taskId: 509323,
        update: { dueOn: null, labelNames: ['Deferred', 'Blocked'] }
      })
    )
    await dispatcher.dispatch(makeRequest('activecollab.completeTask', { taskId: 509323 }))
    await dispatcher.dispatch(makeRequest('activecollab.reopenTask', { taskId: 509323 }))
    await dispatcher.dispatch(
      makeRequest('activecollab.postComment', { taskId: 509323, bodyHtml: '<p>Shipped</p>' })
    )

    // The null has to survive the schema: dropping it would turn "clear the due date" into a no-op.
    expect(runtime.activeCollabUpdateTask).toHaveBeenCalledWith({
      projectId: 3790,
      taskId: 509323,
      update: { dueOn: null, labelNames: ['Deferred', 'Blocked'] }
    })
    expect(runtime.activeCollabCompleteTask).toHaveBeenCalledWith({ taskId: 509323 })
    expect(runtime.activeCollabReopenTask).toHaveBeenCalledWith({ taskId: 509323 })
    expect(runtime.activeCollabPostComment).toHaveBeenCalledWith({
      taskId: 509323,
      bodyHtml: '<p>Shipped</p>'
    })
  })

  it('rejects a malformed request at the schema, before the runtime is touched', async () => {
    const runtime = makeRuntime()
    const dispatcher = new RpcDispatcher({ runtime, methods: ACTIVECOLLAB_METHODS })

    const missingId = await dispatcher.dispatch(makeRequest('activecollab.completeTask', {}))
    const missingBody = await dispatcher.dispatch(
      makeRequest('activecollab.postComment', { taskId: 509323, bodyHtml: '' })
    )

    expect(errorOf(missingId).code).toBe('invalid_argument')
    expect(errorOf(missingBody).code).toBe('invalid_argument')
    expect(errorOf(missingBody).message).toMatch(/comment body/i)
    expect(runtime.activeCollabCompleteTask).not.toHaveBeenCalled()
    expect(runtime.activeCollabPostComment).not.toHaveBeenCalled()
  })
})
