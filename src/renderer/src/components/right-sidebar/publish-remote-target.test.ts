import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveMock } = vi.hoisted(() => ({ resolveMock: vi.fn() }))

vi.mock('@/runtime/runtime-git-client', () => ({
  resolveRuntimeGitPublishRemote: resolveMock
}))

import { choosePublishPushTarget } from './publish-remote-target'

const context = { settings: null, worktreeId: 'wt-1', worktreePath: '/repo' }

describe('choosePublishPushTarget', () => {
  beforeEach(() => {
    resolveMock.mockReset()
  })

  it('keeps an existing push target without asking', async () => {
    const pick = vi.fn()
    const pushTarget = { remoteName: 'fork', branchName: 'feature' }
    expect(
      await choosePublishPushTarget({
        context,
        pushTarget,
        branchName: 'feature',
        pickPublishRemote: pick
      })
    ).toEqual({ kind: 'publish', pushTarget })
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('publishes without a target when the host can pick the remote itself', async () => {
    resolveMock.mockResolvedValue({ remote: 'upstream' })
    const pick = vi.fn()
    expect(
      await choosePublishPushTarget({
        context,
        pushTarget: undefined,
        branchName: 'feature',
        pickPublishRemote: pick
      })
    ).toEqual({ kind: 'publish', pushTarget: undefined })
    expect(pick).not.toHaveBeenCalled()
  })

  it('asks for a remote and publishes to the pick', async () => {
    resolveMock.mockResolvedValue({ needsChoice: true, remotes: ['fork', 'upstream'] })
    const pick = vi.fn().mockResolvedValue('fork')
    expect(
      await choosePublishPushTarget({
        context,
        pushTarget: undefined,
        branchName: 'feature',
        pickPublishRemote: pick
      })
    ).toEqual({ kind: 'publish', pushTarget: { remoteName: 'fork', branchName: 'feature' } })
    expect(pick).toHaveBeenCalledWith(['fork', 'upstream'], 'feature')
  })

  it('reports a cancelled pick', async () => {
    resolveMock.mockResolvedValue({ needsChoice: true, remotes: ['fork', 'upstream'] })
    expect(
      await choosePublishPushTarget({
        context,
        pushTarget: undefined,
        branchName: 'feature',
        pickPublishRemote: vi.fn().mockResolvedValue(null)
      })
    ).toEqual({ kind: 'cancelled' })
  })

  it('falls back to a plain publish when the lookup fails', async () => {
    resolveMock.mockRejectedValue(new Error('Method not found'))
    expect(
      await choosePublishPushTarget({
        context,
        pushTarget: undefined,
        branchName: 'feature',
        pickPublishRemote: vi.fn()
      })
    ).toEqual({ kind: 'publish', pushTarget: undefined })
  })
})
