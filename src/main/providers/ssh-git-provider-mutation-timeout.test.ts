import { describe, expect, it, vi } from 'vitest'
import { SshGitProvider } from './ssh-git-provider'
import { GIT_MUTATION_TIMEOUT_MS } from '../../shared/git-mutation-timeout'

describe('SshGitProvider mutation timeout', () => {
  it('gives undoLastCommit the long mutation timeout', async () => {
    const request = vi.fn().mockResolvedValue({ message: 'feat: x' })
    const provider = new SshGitProvider('conn-1', {
      request,
      notify: vi.fn(),
      onNotification: vi.fn(),
      onNotificationByMethod: vi.fn().mockReturnValue(vi.fn()),
      onDispose: vi.fn().mockReturnValue(vi.fn()),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false)
    } as never)

    await provider.undoLastCommit('/home/user/repo')

    expect(request).toHaveBeenCalledWith(
      'git.undoLastCommit',
      { worktreePath: '/home/user/repo' },
      { timeoutMs: GIT_MUTATION_TIMEOUT_MS }
    )
  })
})
