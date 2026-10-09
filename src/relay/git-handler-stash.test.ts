import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
import { STASH_POP_CONFLICT_MESSAGE } from '../shared/git-failure-detail'
import type { GitBranchStash } from '../shared/git-stash'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

describe('GitHandler stash', () => {
  let dispatcher: MockDispatcher
  let tmpDir: string
  let branch: string

  const branchStash = async (): Promise<GitBranchStash> =>
    (await dispatcher.callRequest('git.branchStash', { worktreePath: tmpDir })) as GitBranchStash
  const stash = (action: string): Promise<unknown> =>
    dispatcher.callRequest('git.stash', { worktreePath: tmpDir, action })

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-git-stash-'))
    dispatcher = createMockDispatcher()
    new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    gitInit(tmpDir)
    // Why: stash writes commits, so the repo needs an identity.
    git(tmpDir, ['config', 'user.email', 'test@example.com'])
    git(tmpDir, ['config', 'user.name', 'Test'])
    writeFileSync(path.join(tmpDir, 'a.txt'), 'base\n')
    gitCommit(tmpDir, 'base')
    branch = git(tmpDir, ['branch', '--show-current'])
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('registers the methods', () => {
    const methods = Array.from(dispatcher._requestHandlers.keys())
    expect(methods).toContain('git.stash')
    expect(methods).toContain('git.branchStash')
  })

  it('stashes tracked and untracked changes, then pops them back', async () => {
    writeFileSync(path.join(tmpDir, 'a.txt'), 'edited\n')
    writeFileSync(path.join(tmpDir, 'new.txt'), 'new\n')
    expect(await branchStash()).toEqual({ branch, stash: null })

    expect(await stash('push')).toEqual({ changed: true, conflictMessage: null })
    expect(git(tmpDir, ['status', '--porcelain'])).toBe('')
    expect(existsSync(path.join(tmpDir, 'new.txt'))).toBe(false)
    const found = await branchStash()
    expect(found.stash?.ref).toBe('stash@{0}')
    expect(found.stash?.subject).toMatch(new RegExp(`^WIP on ${branch}: .* base$`))

    expect(await stash('pop')).toEqual({ changed: true, conflictMessage: null })
    expect(readFileSync(path.join(tmpDir, 'a.txt'), 'utf-8')).toBe('edited\n')
    expect(readFileSync(path.join(tmpDir, 'new.txt'), 'utf-8')).toBe('new\n')
    expect(await branchStash()).toEqual({ branch, stash: null })
  })

  it("pops this branch's newest stash, not another branch's newer one", async () => {
    writeFileSync(path.join(tmpDir, 'a.txt'), 'mine\n')
    await stash('push')
    git(tmpDir, ['checkout', '-q', '-b', 'other'])
    writeFileSync(path.join(tmpDir, 'a.txt'), 'theirs\n')
    git(tmpDir, ['stash', 'push', '-m', 'other work'])
    git(tmpDir, ['checkout', '-q', branch])

    const found = await branchStash()
    expect(found.stash?.ref).toBe('stash@{1}')

    await stash('pop')
    expect(readFileSync(path.join(tmpDir, 'a.txt'), 'utf-8')).toBe('mine\n')
    expect(git(tmpDir, ['stash', 'list', '--format=%gs'])).toBe('On other: other work')
  })

  it('refuses to pop when the branch has no stash', async () => {
    git(tmpDir, ['checkout', '-q', '-b', 'other'])
    writeFileSync(path.join(tmpDir, 'a.txt'), 'theirs\n')
    await stash('push')
    git(tmpDir, ['checkout', '-q', branch])

    expect(await branchStash()).toEqual({ branch, stash: null })
    await expect(stash('pop')).rejects.toThrow(`No stash for ${branch}`)
    expect(git(tmpDir, ['stash', 'list'])).not.toBe('')
  })

  it('reports no branch on a detached HEAD', async () => {
    writeFileSync(path.join(tmpDir, 'a.txt'), 'edited\n')
    await stash('push')
    git(tmpDir, ['checkout', '-q', '--detach'])

    expect(await branchStash()).toEqual({ branch: null, stash: null })
    await expect(stash('pop')).rejects.toThrow('Check out a branch to pop its stash.')
  })

  it('reports nothing to stash on a clean tree', async () => {
    expect(await stash('push')).toEqual({ changed: false, conflictMessage: null })
  })

  it('returns the plain conflict message when the pop conflicts', async () => {
    writeFileSync(path.join(tmpDir, 'a.txt'), 'stashed\n')
    await stash('push')
    writeFileSync(path.join(tmpDir, 'a.txt'), 'committed\n')
    gitCommit(tmpDir, 'diverge')

    expect(await stash('pop')).toEqual({
      changed: true,
      conflictMessage: STASH_POP_CONFLICT_MESSAGE
    })
    expect(git(tmpDir, ['diff', '--name-only', '--diff-filter=U'])).toBe('a.txt')
    expect((await branchStash()).stash).not.toBeNull()
  })

  it('maps a pop blocked by local edits to a plain message', async () => {
    writeFileSync(path.join(tmpDir, 'a.txt'), 'stashed\n')
    await stash('push')
    writeFileSync(path.join(tmpDir, 'a.txt'), 'local edit\n')

    await expect(stash('pop')).rejects.toThrow(
      'Popping would overwrite local changes. Commit or discard them first.'
    )
  })

  it('rejects unknown actions', async () => {
    await expect(stash('drop')).rejects.toThrow('Unsupported stash operation.')
  })
})
