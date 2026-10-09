import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { GitHandler } from './git-handler'
import { RelayContext } from './context'
import {
  createMockDispatcher,
  gitInit,
  gitCommit,
  type MockDispatcher,
  type RelayDispatcher
} from './git-handler-test-setup'
import { PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE } from '../shared/git-publish-remote'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

describe('GitHandler publish remote selection', () => {
  let dispatcher: MockDispatcher
  let tmpDir: string
  let repo: string

  function addBareRemote(name: string): string {
    const bare = path.join(tmpDir, `${name}.git`)
    git(tmpDir, ['init', '--bare', '-q', bare])
    git(repo, ['remote', 'add', name, bare])
    return bare
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-git-publish-'))
    repo = path.join(tmpDir, 'repo')
    mkdirSync(repo)
    gitInit(repo)
    writeFileSync(path.join(repo, 'a.txt'), 'one\n')
    gitCommit(repo, 'first')
    git(repo, ['checkout', '-q', '-b', 'feature'])
    dispatcher = createMockDispatcher()
    new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('publishes to the only remote even when it is not named origin', async () => {
    const bare = addBareRemote('upstream')

    await dispatcher.callRequest('git.push', { worktreePath: repo, publish: true })

    expect(git(bare, ['rev-parse', 'refs/heads/feature'])).toBe(git(repo, ['rev-parse', 'HEAD']))
    expect(git(repo, ['rev-parse', '--abbrev-ref', 'feature@{upstream}'])).toBe('upstream/feature')
  })

  it('prefers origin when several remotes exist', async () => {
    addBareRemote('fork')
    const origin = addBareRemote('origin')

    await dispatcher.callRequest('git.push', { worktreePath: repo, publish: true })

    expect(git(origin, ['rev-parse', 'refs/heads/feature'])).toBe(git(repo, ['rev-parse', 'HEAD']))
  })

  it('resolves the publish remote without pushing', async () => {
    expect(await dispatcher.callRequest('git.publishRemote', { worktreePath: repo })).toEqual({
      needsChoice: true,
      remotes: []
    })
    addBareRemote('upstream')
    expect(await dispatcher.callRequest('git.publishRemote', { worktreePath: repo })).toEqual({
      remote: 'upstream'
    })
  })

  it('asks for a remote when several exist without origin, then publishes to the pick', async () => {
    addBareRemote('upstream')
    const fork = addBareRemote('fork')

    const resolution = (await dispatcher.callRequest('git.publishRemote', {
      worktreePath: repo
    })) as { needsChoice: true; remotes: string[] }
    expect(resolution.needsChoice).toBe(true)
    expect([...resolution.remotes].sort()).toEqual(['fork', 'upstream'])
    await expect(
      dispatcher.callRequest('git.push', { worktreePath: repo, publish: true })
    ).rejects.toThrow(PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE)

    await dispatcher.callRequest('git.push', {
      worktreePath: repo,
      publish: true,
      pushTarget: { remoteName: 'fork', branchName: 'feature' }
    })
    expect(git(fork, ['rev-parse', 'refs/heads/feature'])).toBe(git(repo, ['rev-parse', 'HEAD']))
    expect(git(repo, ['rev-parse', '--abbrev-ref', 'feature@{upstream}'])).toBe('fork/feature')
  })
})
