import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock, syncForkDefaultBranchMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn(),
  syncForkDefaultBranchMock: vi.fn()
}))

vi.mock('./runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

vi.mock('../../shared/git-fork-sync', () => ({
  syncForkDefaultBranch: syncForkDefaultBranchMock
}))

import { gitSyncForkDefaultBranch } from './fork-sync'

describe('gitSyncForkDefaultBranch', () => {
  beforeEach(() => {
    gitExecFileAsyncMock.mockReset().mockResolvedValue({ stdout: '', stderr: '' })
    syncForkDefaultBranchMock.mockReset()
  })

  it("uses the repo's configured ssh command for network steps only", async () => {
    syncForkDefaultBranchMock.mockImplementation(
      async (runGit: (args: string[]) => Promise<unknown>) => {
        await runGit(['rev-parse', '--verify', 'HEAD'])
        await runGit(['ls-remote', '--symref', 'upstream', 'HEAD'])
        await runGit(['fetch', '--no-tags', 'upstream'])
        await runGit(['push', 'origin', 'abc:refs/heads/main'])
        return { status: 'synced' }
      }
    )

    await gitSyncForkDefaultBranch('/repo', { remoteName: 'upstream' } as never)

    const flagBySubcommand = Object.fromEntries(
      gitExecFileAsyncMock.mock.calls.map(([args, options]) => [
        args[0],
        options.useConfiguredSshCommandForNetwork === true
      ])
    )
    expect(flagBySubcommand).toEqual({
      'rev-parse': false,
      'ls-remote': true,
      fetch: true,
      push: true
    })
  })
})
