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

  it('lists remote-only branches of a clone, unmangled and without origin/HEAD', async () => {
    // A fresh clone has exactly one local head, so every other branch of the site lives only
    // under refs/remotes — the case the environment-name autocomplete is actually asked about.
    const remote = await mkdtemp(join(tmpdir(), 'orca-branches-remote-'))
    const clone = await mkdtemp(join(tmpdir(), 'orca-branches-clone-'))
    try {
      initRepoOnBranch(remote, 'main')
      execFileSync('git', ['branch', 'master'], { cwd: remote })
      execFileSync('git', ['branch', 'front'], { cwd: remote })
      execFileSync('git', ['branch', 'feature/login'], { cwd: remote })
      execFileSync('git', ['clone', '--quiet', remote, clone])

      const branches = await listCheckoutBranches(clone)

      expect(branches.sort()).toEqual(['feature/login', 'front', 'main', 'master'])
      expect(branches).not.toContain('HEAD')
      expect(branches.filter((branch) => branch.startsWith('origin/'))).toEqual([])
      // 'main' has both a local head and a remote-tracking ref: one suggestion, not two.
      expect(branches.filter((branch) => branch === 'main')).toHaveLength(1)
    } finally {
      await rm(remote, { recursive: true, force: true })
      await rm(clone, { recursive: true, force: true })
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
