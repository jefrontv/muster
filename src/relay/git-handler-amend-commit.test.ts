import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
import { buildGitCommitArgs, NO_COMMIT_TO_AMEND_MESSAGE } from '../shared/git-amend-commit'

const GIT_IDENTITY_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com'
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    env: GIT_IDENTITY_ENV
  }).trim()
}

describe('buildGitCommitArgs', () => {
  it('adds --amend only when asked', () => {
    expect(buildGitCommitArgs('msg')).toEqual(['commit', '-m', 'msg'])
    expect(buildGitCommitArgs('msg', { amend: true })).toEqual(['commit', '--amend', '-m', 'msg'])
  })
})

describe('GitHandler amend commit', () => {
  let dispatcher: MockDispatcher
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-git-amend-'))
    dispatcher = createMockDispatcher()
    new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('registers the methods', () => {
    const methods = Array.from(dispatcher._requestHandlers.keys())
    expect(methods).toContain('git.amendCommit')
    expect(methods).toContain('git.lastCommitMessage')
  })

  it('returns the full last commit message', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'subject\n\nbody line')

    const result = await dispatcher.callRequest('git.lastCommitMessage', { worktreePath: tmpDir })

    expect(result).toEqual({ message: 'subject\n\nbody line' })
  })

  it('rejects reading the message on an unborn branch', async () => {
    gitInit(tmpDir)

    await expect(
      dispatcher.callRequest('git.lastCommitMessage', { worktreePath: tmpDir })
    ).rejects.toThrow(NO_COMMIT_TO_AMEND_MESSAGE)
  })

  it('replaces HEAD with the staged changes and the new message', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'first')
    const parentOid = git(tmpDir, ['rev-parse', 'HEAD'])
    writeFileSync(path.join(tmpDir, 'b.txt'), 'two\n')
    gitCommit(tmpDir, 'second')
    const oldHead = git(tmpDir, ['rev-parse', 'HEAD'])
    writeFileSync(path.join(tmpDir, 'c.txt'), 'three\n')
    git(tmpDir, ['add', 'c.txt'])

    const result = await dispatcher.callRequest('git.amendCommit', {
      worktreePath: tmpDir,
      message: 'second, amended'
    })

    expect(result).toEqual({ success: true })
    expect(git(tmpDir, ['rev-parse', 'HEAD'])).not.toBe(oldHead)
    expect(git(tmpDir, ['rev-parse', 'HEAD~1'])).toBe(parentOid)
    expect(git(tmpDir, ['log', '-1', '--format=%B'])).toBe('second, amended')
    expect(git(tmpDir, ['show', '--name-only', '--format=', 'HEAD']).split('\n').sort()).toEqual([
      'b.txt',
      'c.txt'
    ])
    expect(git(tmpDir, ['rev-list', '--count', 'HEAD'])).toBe('2')
  })

  it('rewords HEAD when nothing is staged', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'typo mesage')

    const result = await dispatcher.callRequest('git.amendCommit', {
      worktreePath: tmpDir,
      message: 'fixed message'
    })

    expect(result).toEqual({ success: true })
    expect(git(tmpDir, ['log', '-1', '--format=%B'])).toBe('fixed message')
    expect(git(tmpDir, ['rev-list', '--count', 'HEAD'])).toBe('1')
  })

  it('reports a failure instead of committing on an unborn branch', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    git(tmpDir, ['add', 'a.txt'])

    const result = (await dispatcher.callRequest('git.amendCommit', {
      worktreePath: tmpDir,
      message: 'nope'
    })) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(() => git(tmpDir, ['rev-parse', '--verify', '--quiet', 'HEAD'])).toThrow()
  })
})
