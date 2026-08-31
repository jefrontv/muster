// The whole point of the batch branch probe: a sidebar refresh must not spawn a git child per site.
//
// Kept apart from site-summary.test.ts because that file needs the REAL runner to prove the
// subprocess fallback still works; this one needs it mocked to prove the fast path never reaches it.

import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'

vi.mock('./site-secret-store', () => ({
  getSiteSecretPresence: () => ({ ssh: false, db: false })
}))

const commandExecFileAsyncMock = vi.hoisted(() => vi.fn())
vi.mock('../git/runner', () => ({ commandExecFileAsync: commandExecFileAsyncMock }))

const { buildSiteSummaries } = await import('./site-summary')

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
    searchReplaceTimeoutSeconds: 0,
    ...overrides
  }
}

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

describe('buildSiteSummaries subprocess budget', () => {
  it('spawns no git child for sites the disk probe can see', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-spawn-budget-'))
    try {
      const records: Site[] = []
      for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const dir = join(root, `site-${index}`)
        await mkdir(dir, { recursive: true })
        initRepoOnBranch(dir, `branch-${index}`)
        records.push(site({ id: `site-${index}`, path: dir }))
      }

      const summaries = await buildSiteSummaries(records)

      expect(summaries.map((entry) => entry.branch)).toEqual(
        records.map((_, index) => `branch-${index}`)
      )
      // The assertion that matters: eight sites, zero children. This used to be eight concurrent
      // `git rev-parse` spawns, and 208 on the machine that motivated the change.
      expect(commandExecFileAsyncMock).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('spawns at most one child per site the probe cannot see', async () => {
    commandExecFileAsyncMock.mockResolvedValue({ stdout: 'fallback-branch\n', stderr: '' })
    const root = await mkdtemp(join(tmpdir(), 'orca-spawn-fallback-'))
    try {
      // A folder with no repository anywhere beneath it: both probe candidates miss.
      const bare = join(root, 'no-repo')
      await mkdir(bare, { recursive: true })

      const [summary] = await buildSiteSummaries([site({ path: bare })])

      expect(summary.branch).toBe('fallback-branch')
      expect(commandExecFileAsyncMock).toHaveBeenCalledTimes(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
