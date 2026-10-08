import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RelayContext } from './context'
import { GitHandler } from './git-handler'
import {
  createMockDispatcher,
  gitCommit,
  gitInit,
  type MockDispatcher,
  type RelayDispatcher
} from './git-handler-test-setup'

function writeHook(repo: string, name: string, body: string): void {
  const hookPath = join(repo, '.git', 'hooks', name)
  writeFileSync(hookPath, `#!/bin/sh\n${body}\n`)
  chmodSync(hookPath, 0o755)
}

function headCommitCount(repo: string): number {
  return Number(
    execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf-8' }).trim()
  )
}

describe('GitHandler mutation cancellation', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let root: string
  let repo: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'relay-mutation-cancel-'))
    repo = join(root, 'repo')
    gitInit(repo)
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    gitCommit(repo, 'initial')
    dispatcher = createMockDispatcher()
    handler = new GitHandler(dispatcher as unknown as RelayDispatcher, new RelayContext())
  })

  afterEach(async () => {
    handler.dispose()
    await rm(root, { recursive: true, force: true })
  })

  it('stops a commit blocked in a slow pre-commit hook when the request is cancelled', async () => {
    writeHook(repo, 'pre-commit', 'sleep 10')
    writeFileSync(join(repo, 'a.txt'), 'b\n')
    execFileSync('git', ['add', 'a.txt'], { cwd: repo })
    const controller = new AbortController()
    const startedAt = Date.now()
    setTimeout(() => controller.abort(), 300)

    const result = (await dispatcher.callRequest(
      'git.commit',
      { worktreePath: repo, message: 'second' },
      { isStale: () => false, signal: controller.signal }
    )) as { success: boolean }

    expect(result.success).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(5_000)
    expect(headCommitCount(repo)).toBe(1)
  })

  it('stops a push blocked in a slow pre-push hook when the request is cancelled', async () => {
    const remote = join(root, 'remote.git')
    execFileSync('git', ['init', '--bare', remote])
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: repo })
    writeHook(repo, 'pre-push', 'sleep 10')
    const controller = new AbortController()
    const startedAt = Date.now()
    setTimeout(() => controller.abort(), 300)

    await expect(
      dispatcher.callRequest(
        'git.push',
        { worktreePath: repo, publish: true },
        { isStale: () => false, signal: controller.signal }
      )
    ).rejects.toThrow()
    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })

  it('rejects a fetch whose request was already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      dispatcher.callRequest(
        'git.fetch',
        { worktreePath: repo },
        { isStale: () => false, signal: controller.signal }
      )
    ).rejects.toThrow()
  })

  it('runs commit hooks with credential prompts disabled', async () => {
    const envFile = join(root, 'hook-env.txt')
    writeHook(repo, 'pre-commit', `printf '%s' "$GIT_TERMINAL_PROMPT" > '${envFile}'`)
    writeFileSync(join(repo, 'a.txt'), 'c\n')
    execFileSync('git', ['add', 'a.txt'], { cwd: repo })

    const result = (await dispatcher.callRequest(
      'git.commit',
      { worktreePath: repo, message: 'third' },
      { isStale: () => false }
    )) as { success: boolean }

    expect(result.success).toBe(true)
    expect(readFileSync(envFile, 'utf-8')).toBe('0')
  })
})
