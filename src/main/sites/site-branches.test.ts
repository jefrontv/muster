import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listCheckoutBranches } from './site-branches'

/**
 * A real repo — the listing runs live git, so it cannot be faked.
 *
 * `symbolic-ref` instead of `init --initial-branch`: the latter needs Git 2.28, above the repo's
 * 2.25 baseline. An empty commit is required because refs/heads is empty on an unborn HEAD.
 */
function initRepoOnBranch(dir: string, branch: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
  execFileSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: dir })
  execFileSync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'init'
    ],
    { cwd: dir }
  )
}

describe('listCheckoutBranches', () => {
  it('lists every local branch of a checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branches-repo-'))
    try {
      initRepoOnBranch(root, 'main')
      execFileSync('git', ['branch', 'develop'], { cwd: root })
      execFileSync('git', ['branch', 'feature/login'], { cwd: root })
      const branches = await listCheckoutBranches(root)
      expect(branches.sort()).toEqual(['develop', 'feature/login', 'main'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('answers [] for a folder that is not a checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-branches-plain-'))
    try {
      expect(await listCheckoutBranches(root)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
