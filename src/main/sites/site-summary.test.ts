import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptySiteEnvironment, type Site, type SiteCustomStep } from '../../shared/site-types'

vi.mock('./site-secret-store', () => ({
  getSiteSecretPresence: () => ({ ssh: false, db: false })
}))

const { buildSiteSummary, buildSiteSummaries } = await import('./site-summary')

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

// Why: buildSiteSummaries stopped spawning `git rev-parse` per site (208 concurrent children on a
// real install) and reads `.git/HEAD` off disk instead. The batch path must agree with the
// subprocess it replaced on every scenario above, and must still fall back where the file read
// cannot reach — `git rev-parse` walks up from its cwd, a file read does not.
describe('buildSiteSummaries branch parity', () => {
  async function withRepo(
    label: string,
    build: (root: string) => Promise<Site>,
    assert: (batch: string | null, single: string | null) => void
  ): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), `orca-summaries-${label}-`))
    try {
      const record = await build(root)
      const [batched] = await buildSiteSummaries([record])
      const single = await buildSiteSummary(record)
      assert(batched.branch, single.branch)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  it('agrees with the subprocess for a plain checkout', async () => {
    await withRepo(
      'plain',
      async (root) => {
        initRepoOnBranch(root, 'master')
        return site({ path: root, localWpRoot: '' })
      },
      (batch, single) => {
        expect(batch).toBe('master')
        expect(batch).toBe(single)
      }
    )
  })

  it('agrees for a LocalWP checkout relocated into app/public', async () => {
    await withRepo(
      'localwp',
      async (root) => {
        const wpRoot = join(root, 'app', 'public')
        await mkdir(wpRoot, { recursive: true })
        initRepoOnBranch(wpRoot, 'release')
        return site({ path: root, localWpRoot: 'app/public' })
      },
      (batch, single) => {
        expect(batch).toBe('release')
        expect(batch).toBe(single)
      }
    )
  })

  // A recorded WordPress subpath with `.git` left at the top — Bedrock's `web/`. The checkout
  // directory has no repository, so only probing the site root as well finds the branch.
  it('agrees when the WordPress subpath is not the repository root', async () => {
    await withRepo(
      'bedrock',
      async (root) => {
        await mkdir(join(root, 'web'), { recursive: true })
        initRepoOnBranch(root, 'main')
        return site({ path: root, localWpRoot: 'web' })
      },
      (batch, single) => {
        expect(batch).toBe('main')
        expect(batch).toBe(single)
      }
    )
  })

  it('agrees for a folder that is not a checkout', async () => {
    await withRepo(
      'nogit',
      async (root) => site({ path: root }),
      (batch, single) => {
        expect(batch).toBeNull()
        expect(batch).toBe(single)
      }
    )
  })

  // The one case the file read cannot answer: the repository is an ancestor of the site folder, so
  // both probe candidates miss and only `git rev-parse`'s upward walk finds it. Without the
  // fallback this site would silently lose its branch.
  it('falls back to the subprocess when the repository is above the site folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summaries-ancestor-'))
    try {
      initRepoOnBranch(root, 'trunk')
      const nested = join(root, 'sites', 'acme')
      await mkdir(nested, { recursive: true })
      const [batched] = await buildSiteSummaries([site({ path: nested, localWpRoot: '' })])

      expect(batched.branch).toBe('trunk')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves every site in one sweep', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-summaries-many-'))
    try {
      const records: Site[] = []
      for (const [index, branch] of ['one', 'two', 'three'].entries()) {
        const dir = join(root, `site-${index}`)
        await mkdir(dir, { recursive: true })
        initRepoOnBranch(dir, branch)
        records.push(site({ id: `site-${index}`, path: dir, localWpRoot: '' }))
      }
      const summaries = await buildSiteSummaries(records)

      expect(summaries.map((entry) => entry.branch)).toEqual(['one', 'two', 'three'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

// Why: the Import/Deploy buttons gate on these counts. Omitting custom steps made a site whose
// only enabled work was a custom step look like "nothing selected", so the run could not start.
describe('buildSiteSummary selected counts', () => {
  const customStep = (overrides: Partial<SiteCustomStep>): SiteCustomStep => ({
    id: 'step-1',
    name: 'Sync uploads',
    group: 'import',
    runsOn: 'local',
    command: 'echo sync',
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  })

  it('counts enabled custom steps alongside the built-in toggles', async () => {
    const summary = await buildSiteSummary(
      site({
        path: '/tmp/does-not-exist-summary-counts',
        environments: { main: { ...createEmptySiteEnvironment(), exportDatabase: true } },
        activeEnvironment: 'main',
        customSteps: [customStep({}), customStep({ id: 'step-2', group: 'deploy' })]
      })
    )

    expect(summary.importSelectedCount).toBe(2)
    expect(summary.deploySelectedCount).toBe(1)
  })

  it('counts a custom-steps-only site as having work to do', async () => {
    const summary = await buildSiteSummary(
      site({
        path: '/tmp/does-not-exist-summary-only',
        environments: { main: createEmptySiteEnvironment() },
        activeEnvironment: 'main',
        customSteps: [customStep({})]
      })
    )

    expect(summary.importSelectedCount).toBe(1)
  })

  it('ignores a disabled custom step', async () => {
    const summary = await buildSiteSummary(
      site({
        path: '/tmp/does-not-exist-summary-disabled',
        environments: { main: createEmptySiteEnvironment() },
        activeEnvironment: 'main',
        customSteps: [customStep({ enabled: false })]
      })
    )

    expect(summary.importSelectedCount).toBe(0)
  })
})
