import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
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

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function gitMayFail(cwd: string, args: string[]): void {
  try {
    git(cwd, args)
  } catch {
    // Expected: the command stops on a conflict.
  }
}

function setupRepo(dir: string): string {
  gitInit(dir)
  // Why: the relay runs continue itself, so the repo needs an identity and no signing prompt.
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(path.join(dir, 'a.txt'), 'base\n')
  gitCommit(dir, 'base')
  return git(dir, ['branch', '--show-current'])
}

// Two branches that both edit a.txt, so replaying `feature` onto main conflicts.
function setupDivergedBranches(dir: string): string {
  const main = setupRepo(dir)
  git(dir, ['checkout', '-b', 'feature'])
  writeFileSync(path.join(dir, 'a.txt'), 'feature\n')
  gitCommit(dir, 'feature edit')
  git(dir, ['checkout', main])
  writeFileSync(path.join(dir, 'a.txt'), 'main\n')
  gitCommit(dir, 'main edit')
  return main
}

describe('GitHandler sequencer actions', () => {
  let dispatcher: MockDispatcher
  let tmpDir: string
  const previousEditor = process.env.GIT_EDITOR

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'relay-git-sequencer-'))
    dispatcher = createMockDispatcher()
    new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
    // Why: a real editor here would block; continue must override it.
    process.env.GIT_EDITOR = 'false'
  })

  afterEach(async () => {
    if (previousEditor === undefined) {
      delete process.env.GIT_EDITOR
    } else {
      process.env.GIT_EDITOR = previousEditor
    }
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('registers the methods', () => {
    const methods = Array.from(dispatcher._requestHandlers.keys())
    expect(methods).toContain('git.sequencerAction')
    expect(methods).toContain('git.mergeMessage')
  })

  it('continues a rebase after the conflict is resolved, without opening an editor', async () => {
    const main = setupDivergedBranches(tmpDir)
    git(tmpDir, ['checkout', 'feature'])
    gitMayFail(tmpDir, ['rebase', main])
    expect(existsSync(path.join(tmpDir, '.git', 'rebase-merge'))).toBe(true)

    await expect(
      dispatcher.callRequest('git.sequencerAction', {
        worktreePath: tmpDir,
        action: 'rebase-continue'
      })
    ).rejects.toThrow('Resolve and stage every conflicted file, then continue.')

    writeFileSync(path.join(tmpDir, 'a.txt'), 'resolved\n')
    git(tmpDir, ['add', 'a.txt'])
    const result = await dispatcher.callRequest('git.sequencerAction', {
      worktreePath: tmpDir,
      action: 'rebase-continue'
    })

    expect(result).toEqual({ stoppedOnConflict: false })
    expect(existsSync(path.join(tmpDir, '.git', 'rebase-merge'))).toBe(false)
    expect(git(tmpDir, ['log', '-1', '--format=%s'])).toBe('feature edit')
    expect(git(tmpDir, ['show', 'HEAD:a.txt'])).toBe('resolved')
  })

  it('skips the conflicting commit during a rebase', async () => {
    const main = setupDivergedBranches(tmpDir)
    git(tmpDir, ['checkout', 'feature'])
    gitMayFail(tmpDir, ['rebase', main])

    const result = await dispatcher.callRequest('git.sequencerAction', {
      worktreePath: tmpDir,
      action: 'rebase-skip'
    })

    expect(result).toEqual({ stoppedOnConflict: false })
    expect(git(tmpDir, ['rev-parse', 'HEAD'])).toBe(git(tmpDir, ['rev-parse', main]))
  })

  it('reports a stop at the next conflict as progress, not failure', async () => {
    const main = setupDivergedBranches(tmpDir)
    git(tmpDir, ['checkout', 'feature'])
    writeFileSync(path.join(tmpDir, 'a.txt'), 'feature again\n')
    gitCommit(tmpDir, 'second feature edit')
    gitMayFail(tmpDir, ['rebase', main])

    const result = await dispatcher.callRequest('git.sequencerAction', {
      worktreePath: tmpDir,
      action: 'rebase-skip'
    })

    expect(result).toEqual({ stoppedOnConflict: true })
  })

  it('continues and aborts a cherry-pick', async () => {
    const main = setupDivergedBranches(tmpDir)
    const featureOid = git(tmpDir, ['rev-parse', 'feature'])
    gitMayFail(tmpDir, ['cherry-pick', featureOid])
    expect(existsSync(path.join(tmpDir, '.git', 'CHERRY_PICK_HEAD'))).toBe(true)

    await dispatcher.callRequest('git.sequencerAction', {
      worktreePath: tmpDir,
      action: 'cherry-pick-abort'
    })
    expect(existsSync(path.join(tmpDir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
    expect(git(tmpDir, ['rev-parse', 'HEAD'])).toBe(git(tmpDir, ['rev-parse', main]))

    gitMayFail(tmpDir, ['cherry-pick', featureOid])
    writeFileSync(path.join(tmpDir, 'a.txt'), 'picked\n')
    git(tmpDir, ['add', 'a.txt'])
    await dispatcher.callRequest('git.sequencerAction', {
      worktreePath: tmpDir,
      action: 'cherry-pick-continue'
    })
    expect(existsSync(path.join(tmpDir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
    expect(git(tmpDir, ['log', '-1', '--format=%s'])).toBe('feature edit')
  })

  it('rejects unknown actions', async () => {
    setupRepo(tmpDir)
    await expect(
      dispatcher.callRequest('git.sequencerAction', { worktreePath: tmpDir, action: 'reset' })
    ).rejects.toThrow('Unsupported git operation.')
  })

  it("returns git's prepared merge message without comment lines", async () => {
    setupDivergedBranches(tmpDir)
    expect(await dispatcher.callRequest('git.mergeMessage', { worktreePath: tmpDir })).toBeNull()
    gitMayFail(tmpDir, ['merge', 'feature'])

    const message = await dispatcher.callRequest('git.mergeMessage', { worktreePath: tmpDir })

    expect(message).toMatch(/^Merge branch 'feature'/)
    expect(message).not.toContain('#')
  })

  it('reads the merge message from a linked worktree', async () => {
    const main = setupDivergedBranches(tmpDir)
    const linked = path.join(tmpDir, 'linked')
    git(tmpDir, ['worktree', 'add', '-b', 'linked-branch', linked, main])
    gitMayFail(linked, ['merge', 'feature'])

    const message = await dispatcher.callRequest('git.mergeMessage', { worktreePath: linked })

    expect(message).toBe("Merge branch 'feature' into linked-branch")
  })
})
