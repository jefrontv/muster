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
import {
  MERGE_COMMIT_UNDO_MESSAGE,
  NO_COMMITS_TO_UNDO_MESSAGE
} from '../shared/git-undo-last-commit'

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

describe('GitHandler undoLastCommit', () => {
  let dispatcher: MockDispatcher
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-git-undo-'))
    dispatcher = createMockDispatcher()
    new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('registers the method', () => {
    expect(Array.from(dispatcher._requestHandlers.keys())).toContain('git.undoLastCommit')
  })

  it('moves HEAD back one commit, keeps the changes staged, and returns the message', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'first')
    const firstOid = git(tmpDir, ['rev-parse', 'HEAD'])
    writeFileSync(path.join(tmpDir, 'b.txt'), 'two\n')
    gitCommit(tmpDir, 'second\n\nbody line')

    const result = await dispatcher.callRequest('git.undoLastCommit', { worktreePath: tmpDir })

    expect(result).toEqual({ message: 'second\n\nbody line' })
    expect(git(tmpDir, ['rev-parse', 'HEAD'])).toBe(firstOid)
    expect(git(tmpDir, ['diff', '--cached', '--name-only'])).toBe('b.txt')
  })

  it('undoes the root commit and leaves its files staged on an unborn branch', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'first')

    const result = await dispatcher.callRequest('git.undoLastCommit', { worktreePath: tmpDir })

    expect(result).toEqual({ message: 'first' })
    expect(() => git(tmpDir, ['rev-parse', '--verify', '--quiet', 'HEAD'])).toThrow()
    expect(git(tmpDir, ['diff', '--cached', '--name-only'])).toBe('a.txt')
  })

  it('turns a held ref lock into the plain lock message', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'one\n')
    gitCommit(tmpDir, 'first')
    writeFileSync(path.join(tmpDir, 'b.txt'), 'two\n')
    gitCommit(tmpDir, 'second')
    const branch = git(tmpDir, ['branch', '--show-current'])
    writeFileSync(path.join(tmpDir, '.git', 'refs', 'heads', `${branch}.lock`), '')

    const failure = await dispatcher
      .callRequest('git.undoLastCommit', { worktreePath: tmpDir })
      .catch((error: unknown) => error)

    expect((failure as Error).message).toMatch(/^Another Git process is using this repository\./)
    expect((failure as Error).message).not.toContain('Command failed')
  })

  it('rejects when there are no commits', async () => {
    gitInit(tmpDir)

    await expect(
      dispatcher.callRequest('git.undoLastCommit', { worktreePath: tmpDir })
    ).rejects.toThrow(NO_COMMITS_TO_UNDO_MESSAGE)
  })

  it('rejects a merge commit and leaves HEAD alone', async () => {
    gitInit(tmpDir)
    writeFileSync(path.join(tmpDir, 'a.txt'), 'base\n')
    gitCommit(tmpDir, 'base')
    const baseBranch = git(tmpDir, ['branch', '--show-current'])
    git(tmpDir, ['checkout', '-b', 'feature'])
    writeFileSync(path.join(tmpDir, 'feature.txt'), 'feature\n')
    gitCommit(tmpDir, 'feature')
    git(tmpDir, ['checkout', baseBranch])
    writeFileSync(path.join(tmpDir, 'main.txt'), 'main\n')
    gitCommit(tmpDir, 'main')
    git(tmpDir, ['merge', '--no-ff', '-m', 'merge feature', 'feature'])
    const mergeOid = git(tmpDir, ['rev-parse', 'HEAD'])

    await expect(
      dispatcher.callRequest('git.undoLastCommit', { worktreePath: tmpDir })
    ).rejects.toThrow(MERGE_COMMIT_UNDO_MESSAGE)
    expect(git(tmpDir, ['rev-parse', 'HEAD'])).toBe(mergeOid)
  })
})
