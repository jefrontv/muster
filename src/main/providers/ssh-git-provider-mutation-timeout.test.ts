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

  it('sends amend as its own relay method so an older relay fails closed', async () => {
    const request = vi.fn().mockResolvedValue({ success: true })
    const provider = new SshGitProvider('conn-1', {
      request,
      notify: vi.fn(),
      onNotification: vi.fn(),
      onNotificationByMethod: vi.fn().mockReturnValue(vi.fn()),
      onDispose: vi.fn().mockReturnValue(vi.fn()),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false)
    } as never)

    await provider.commit('/home/user/repo', 'feat: y', { amend: true })
    await provider.commit('/home/user/repo', 'feat: z')

    expect(request).toHaveBeenNthCalledWith(
      1,
      'git.amendCommit',
      { worktreePath: '/home/user/repo', message: 'feat: y' },
      { timeoutMs: GIT_MUTATION_TIMEOUT_MS }
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'git.commit',
      { worktreePath: '/home/user/repo', message: 'feat: z' },
      { timeoutMs: GIT_MUTATION_TIMEOUT_MS }
    )
  })
})
