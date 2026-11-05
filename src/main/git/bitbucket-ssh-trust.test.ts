import { describe, expect, it } from 'vitest'
import { isBitbucketSshUrl, remoteGitEnv } from './bitbucket-ssh-trust'

const ACCEPT_NEW = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'

describe('isBitbucketSshUrl', () => {
  it('matches scp-style and ssh:// URLs on both Bitbucket SSH hosts', () => {
    expect(isBitbucketSshUrl('git@ssh.bitbucket.org:w/r.git')).toBe(true)
    expect(isBitbucketSshUrl('git@bitbucket.org:w/r.git')).toBe(true)
    expect(isBitbucketSshUrl('ssh://git@ssh.bitbucket.org/w/r.git')).toBe(true)
    expect(isBitbucketSshUrl('ssh://git@ssh.bitbucket.org:22/w/r.git')).toBe(true)
  })

  it('ignores HTTPS, other hosts and lookalike domains', () => {
    expect(isBitbucketSshUrl('https://bitbucket.org/w/r.git')).toBe(false)
    expect(isBitbucketSshUrl('https://user@bitbucket.org/w/r.git')).toBe(false)
    expect(isBitbucketSshUrl('git@github.com:o/r.git')).toBe(false)
    expect(isBitbucketSshUrl('git@bitbucket.org.evil.com:w/r.git')).toBe(false)
    expect(isBitbucketSshUrl('git@notbitbucket.org:w/r.git')).toBe(false)
  })
})

describe('remoteGitEnv', () => {
  it('accepts a new Bitbucket host key under BatchMode', () => {
    const env = remoteGitEnv('git@ssh.bitbucket.org:w/r.git', {}, 'darwin')
    expect(env.GIT_SSH_COMMAND).toBe(ACCEPT_NEW)
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })

  it('keeps strict host checking for other hosts', () => {
    expect(remoteGitEnv('git@github.com:o/r.git', {}, 'darwin').GIT_SSH_COMMAND).toBe(
      'ssh -o BatchMode=yes'
    )
  })

  it('leaves a caller-set GIT_SSH_COMMAND alone', () => {
    const env = remoteGitEnv(
      'git@ssh.bitbucket.org:w/r.git',
      { GIT_SSH_COMMAND: 'my-ssh' },
      'darwin'
    )
    expect(env.GIT_SSH_COMMAND).toBe('my-ssh')
  })

  it('forwards the command to WSL on Windows', () => {
    const env = remoteGitEnv('git@ssh.bitbucket.org:w/r.git', {}, 'win32')
    expect(env.GIT_SSH_COMMAND).toBe(ACCEPT_NEW)
    expect(env.WSLENV).toContain('GIT_SSH_COMMAND')
  })
})
