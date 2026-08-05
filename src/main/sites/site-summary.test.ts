import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'

vi.mock('./site-secret-store', () => ({
  getSiteSecretPresence: () => ({ ssh: false, db: false })
}))

const { buildSiteSummary } = await import('./site-summary')

function site(overrides: Partial<Site>): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: '',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'main',
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    ...overrides
  }
}

/**
 * A real checkout on a named branch — the branch is read live, so it cannot be faked.
 *
 * `symbolic-ref` instead of `init --initial-branch`: the latter needs Git 2.28, above the repo's
 * 2.25 baseline. An empty commit is required because `rev-parse` fails on an unborn HEAD.
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

describe('buildSiteSummary branch detection', () => {
  it('reads the branch from the site root for a plain checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summary-plain-'))
    try {
      initRepoOnBranch(root, 'master')
      const summary = await buildSiteSummary(site({ path: root, localWpRoot: '' }))
      expect(summary.branch).toBe('master')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  // Why: a LocalWP setup moves the project into app/public, taking .git with it. `git rev-parse`
  // only walks up, so probing the site root reported "no branch" and environment resolution
  // silently retargeted to whichever env came first.
  it('reads the branch from app/public after a LocalWP setup relocated the checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summary-localwp-'))
    try {
      const wpRoot = join(root, 'app', 'public')
      await mkdir(wpRoot, { recursive: true })
      initRepoOnBranch(wpRoot, 'master')
      const summary = await buildSiteSummary(site({ path: root, localWpRoot: 'app/public' }))
      expect(summary.branch).toBe('master')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('falls back to the site root when the recorded WordPress root is not there', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summary-missing-wp-'))
    try {
      initRepoOnBranch(root, 'master')
      const summary = await buildSiteSummary(site({ path: root, localWpRoot: 'app/public' }))
      expect(summary.branch).toBe('master')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports no branch for a folder that is not a checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summary-nogit-'))
    try {
      const summary = await buildSiteSummary(site({ path: root }))
      expect(summary.branch).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not probe git at all when the site folder is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summary-gone-'))
    await rm(root, { recursive: true, force: true })
    const summary = await buildSiteSummary(site({ path: root }))
    expect(summary.pathExists).toBe(false)
    expect(summary.branch).toBeNull()
  })
})
