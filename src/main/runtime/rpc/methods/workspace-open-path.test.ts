import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { WORKTREE_METHODS } from './worktree'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('workspace.openPath RPC', () => {
  it('routes workspace.openPath with the caller worktree to the runtime', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      openWorkspacePath: vi.fn().mockResolvedValue({ outcome: 'focused' })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: WORKTREE_METHODS })

    await dispatcher.dispatch(
      makeRequest('workspace.openPath', { path: '/srv/site', callerWorktreeId: 'repo-1::/srv' })
    )
    await dispatcher.dispatch(makeRequest('workspace.openPath', { path: '/srv/other' }))

    expect(runtime.openWorkspacePath).toHaveBeenNthCalledWith(1, {
      path: '/srv/site',
      callerWorktreeId: 'repo-1::/srv'
    })
    expect(runtime.openWorkspacePath).toHaveBeenNthCalledWith(2, { path: '/srv/other' })
  })
})
