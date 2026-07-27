import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveWorkspaceSeedBranchName } from '../../shared/workspace-name'
import { probeRepoHeadBranches } from './repo-head-branch-probe'

let tempDirs: string[] = []

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-repo-head-branch-probe-'))
  tempDirs.push(dir)
  return dir
}

/** Writes a git directory at `gitDir` holding `HEAD`; `.git` itself is what the caller names. */
async function writeGitHead(gitDir: string, head: string): Promise<void> {
  await mkdir(gitDir, { recursive: true })
  await writeFile(join(gitDir, 'HEAD'), head)
}

const DETACHED_SHA = '9f2c1b6a4e0d8c3f5a7b9d1e2f4a6c8b0d2e4f60'

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('probeRepoHeadBranches', () => {
  it('reads the branch out of a top-level .git directory', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'website')
    await writeGitHead(join(repoPath, '.git'), 'ref: refs/heads/main\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({ [repoPath]: 'main' })
  })

  // The case the module exists for: Local puts the checkout two levels down, so the site folder
  // classifies as a plain folder project and its worktree row carries no branch at all.
  it('reads the branch out of a LocalWP checkout under app/public', async () => {
    const root = await tempRoot()
    const sitePath = join(root, 'craftflex-om')
    await writeGitHead(join(sitePath, 'app', 'public', '.git'), 'ref: refs/heads/staging\n')

    expect(await probeRepoHeadBranches([sitePath])).toEqual({ [sitePath]: 'staging' })
  })

  it('prefers the top-level repository when a nested checkout also exists', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'both')
    await writeGitHead(join(repoPath, '.git'), 'ref: refs/heads/top-level\n')
    await writeGitHead(join(repoPath, 'app', 'public', '.git'), 'ref: refs/heads/nested\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({ [repoPath]: 'top-level' })
  })

  // A project with its own repository is not described by whatever a nested WordPress checkout
  // happens to be on, so the first readable git directory settles it either way.
  it('does not fall through to a nested checkout when the top-level HEAD is detached', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'detached-top')
    await writeGitHead(join(repoPath, '.git'), `${DETACHED_SHA}\n`)
    await writeGitHead(join(repoPath, 'app', 'public', '.git'), 'ref: refs/heads/nested\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({})
  })

  it('yields no branch for a detached HEAD rather than passing off the commit sha', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'detached')
    await writeGitHead(join(repoPath, '.git'), `${DETACHED_SHA}\n`)

    const branches = await probeRepoHeadBranches([repoPath])

    expect(branches).toEqual({})
    expect(JSON.stringify(branches)).not.toContain(DETACHED_SHA)
  })

  it('yields no branch for a symbolic ref that names something other than a local branch', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'remote-ref')
    await writeGitHead(join(repoPath, '.git'), 'ref: refs/remotes/origin/main\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({})
  })

  it('returns the short name, keeping the slashes inside a namespaced branch', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'namespaced')
    await writeGitHead(join(repoPath, '.git'), 'ref: refs/heads/feature/add-thing\r\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({ [repoPath]: 'feature/add-thing' })
  })

  it('follows a .git file pointing at an absolute gitdir', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'worktree')
    const gitDir = join(root, 'main', '.git', 'worktrees', 'worktree')
    await writeGitHead(gitDir, 'ref: refs/heads/review\n')
    await mkdir(repoPath, { recursive: true })
    await writeFile(join(repoPath, '.git'), `gitdir: ${gitDir}\n`)

    expect(await probeRepoHeadBranches([repoPath])).toEqual({ [repoPath]: 'review' })
  })

  it('resolves a relative gitdir against the directory holding the .git file', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'plugin')
    await writeGitHead(join(root, '.git', 'modules', 'plugin'), 'ref: refs/heads/plugin-work\n')
    await mkdir(repoPath, { recursive: true })
    await writeFile(join(repoPath, '.git'), 'gitdir: ../.git/modules/plugin\n')

    expect(await probeRepoHeadBranches([repoPath])).toEqual({ [repoPath]: 'plugin-work' })
  })

  it('yields nothing for paths that are not there', async () => {
    const root = await tempRoot()

    expect(await probeRepoHeadBranches([join(root, 'gone'), ''])).toEqual({})
    expect(await probeRepoHeadBranches([])).toEqual({})
  })

  it('yields nothing for a git directory whose HEAD is missing, unreadable or garbage', async () => {
    const root = await tempRoot()
    const noHead = join(root, 'no-head')
    await mkdir(join(noHead, '.git'), { recursive: true })
    const unreadable = join(root, 'unreadable')
    // A directory where the HEAD file belongs: readable as a name, never as bytes.
    await mkdir(join(unreadable, '.git', 'HEAD'), { recursive: true })
    const garbage = join(root, 'garbage')
    await writeGitHead(join(garbage, '.git'), '\u0000\u0001\u0002 not a ref at all\n')

    expect(await probeRepoHeadBranches([noHead, unreadable, garbage])).toEqual({})
  })

  it('keys every answer by the directory it was asked about', async () => {
    const root = await tempRoot()
    const plain = join(root, 'plain')
    const site = join(root, 'site')
    const empty = join(root, 'empty')
    await writeGitHead(join(plain, '.git'), 'ref: refs/heads/master\n')
    await writeGitHead(join(site, 'app', 'public', '.git'), 'ref: refs/heads/staging\n')
    await mkdir(empty, { recursive: true })

    expect(await probeRepoHeadBranches([plain, site, empty], { concurrency: 2 })).toEqual({
      [plain]: 'master',
      [site]: 'staging'
    })
  })
})

// The half of the fix that lives in this process: a real LocalWP layout on disk, through the real
// probe, into the shared precedence the composer seeds its workspace name from. The renderer half
// picks the same wire value up from the preload channel — see useFolderProjectHeadBranch.test.tsx.
describe('seeding a workspace name from a LocalWP folder project', () => {
  it('supplies the nested checkout branch where the worktree row has none', async () => {
    const root = await tempRoot()
    const sitePath = join(root, 'craftflex-om')
    await writeGitHead(join(sitePath, 'app', 'public', '.git'), 'ref: refs/heads/staging\n')

    const branches = await probeRepoHeadBranches([sitePath])

    expect(branches).toEqual({ [sitePath]: 'staging' })
    expect(
      resolveWorkspaceSeedBranchName({
        baseBranch: null,
        mainWorktreeBranch: '',
        probedHeadBranch: branches[sitePath] ?? ''
      })
    ).toBe('staging')
  })

  it('supplies nothing for a site folder with no readable checkout', async () => {
    const root = await tempRoot()
    const sitePath = join(root, 'no-repo')
    await mkdir(sitePath, { recursive: true })

    const branches = await probeRepoHeadBranches([sitePath])

    expect(
      resolveWorkspaceSeedBranchName({
        baseBranch: null,
        mainWorktreeBranch: '',
        probedHeadBranch: branches[sitePath] ?? ''
      })
    ).toBe('')
  })
})
