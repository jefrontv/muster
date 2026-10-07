// Real git, standing in for the server checkout: a diverged server must not get a merge commit.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf-8'
  }).trim()

describe('git pull --ff-only on a diverged server checkout', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'ff-only-'))
    git(root, 'init', '-q', '--bare', 'origin.git')
    git(root, 'clone', '-q', 'origin.git', 'dev')
    await writeFile(path.join(root, 'dev', 'a.txt'), '1')
    git(path.join(root, 'dev'), 'add', '.')
    git(path.join(root, 'dev'), 'commit', '-q', '-m', 'one')
    git(path.join(root, 'dev'), 'push', '-q', 'origin', 'HEAD')
    git(root, 'clone', '-q', 'origin.git', 'server')
    // The server gets its own commit; the remote moves on separately.
    await writeFile(path.join(root, 'server', 'hotfix.txt'), 'x')
    git(path.join(root, 'server'), 'add', '.')
    git(path.join(root, 'server'), 'commit', '-q', '-m', 'hotfix on server')
    await writeFile(path.join(root, 'dev', 'b.txt'), '2')
    git(path.join(root, 'dev'), 'add', '.')
    git(path.join(root, 'dev'), 'commit', '-q', '-m', 'two')
    git(path.join(root, 'dev'), 'push', '-q', 'origin', 'HEAD')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('fails with the message the deploy step recognises, and leaves HEAD alone', () => {
    const server = path.join(root, 'server')
    const before = git(server, 'rev-parse', 'HEAD')
    const result = spawnSync('git', ['pull', '--ff-only'], { cwd: server, encoding: 'utf-8' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/not possible to fast-forward|diverg/i)
    expect(git(server, 'rev-parse', 'HEAD')).toBe(before)
  })
})
