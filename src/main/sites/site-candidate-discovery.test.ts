import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { SITE_CANDIDATES_MAX } from '../../shared/site-discovery-types'
import { discoverSiteCandidates } from './site-candidate-discovery'

let tempDirs: string[] = []

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-site-candidates-'))
  tempDirs.push(dir)
  return dir
}

async function makeGitRepo(path: string): Promise<void> {
  await mkdir(join(path, '.git'), { recursive: true })
}

async function makeWordPress(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'wp-config.php'), '<?php\n')
}

async function makeLocalWpSite(path: string): Promise<void> {
  await mkdir(join(path, 'app', 'public'), { recursive: true })
  await writeFile(join(path, 'app', 'public', 'wp-config.php'), '<?php\n')
}

/** Mirrors project-groups/nested-repo-discovery.test.ts: a path-keyed stand-in for the disk. */
function fakeFilesystem(args: {
  directories: Map<string, string[]>
  files?: Set<string>
  symlinks?: Set<string>
}) {
  return {
    readDirectory: async (dirPath: string) => {
      const names = args.directories.get(dirPath)
      if (!names) {
        throw new Error(`ENOENT: ${dirPath}`)
      }
      return names.map((name) => ({
        name,
        isDirectory: !args.files?.has(`${dirPath}/${name}`),
        isSymlink: args.symlinks?.has(`${dirPath}/${name}`) === true
      }))
    },
    pathExists: async (targetPath: string) =>
      args.files?.has(targetPath) === true || args.directories.has(targetPath),
    joinPath: (parentPath: string, childName: string) => `${parentPath}/${childName}`,
    basename: (path: string) => path.split('/').at(-1) ?? path
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('discoverSiteCandidates', () => {
  it('classifies a LocalWP site as localwp even when a stray top-level wp-config.php exists', async () => {
    const root = await tempRoot()
    await makeLocalWpSite(join(root, 'client-site'))
    await writeFile(join(root, 'client-site', 'wp-config.php'), '<?php\n')

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates).toEqual([
      {
        path: join(root, 'client-site'),
        displayName: 'client-site',
        kind: 'localwp',
        isGitRepo: false
      }
    ])
    expect(result.truncated).toBe(false)
    expect(result.roots).toEqual([root])
  })

  it('detects a plain WordPress install', async () => {
    const root = await tempRoot()
    await makeWordPress(join(root, 'blog'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => [candidate.displayName, candidate.kind])).toEqual([
      ['blog', 'wordpress']
    ])
  })

  it('detects a bare git repository folder', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'tooling'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => [candidate.displayName, candidate.kind])).toEqual([
      ['tooling', 'git']
    ])
  })

  it('omits a folder that is neither WordPress nor a repository', async () => {
    const root = await tempRoot()
    await mkdir(join(root, 'screenshots'), { recursive: true })
    await makeGitRepo(join(root, 'tooling'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['tooling'])
  })

  it('reports isGitRepo for a WordPress install that is also a repository', async () => {
    const root = await tempRoot()
    await makeWordPress(join(root, 'agency-site'))
    await makeGitRepo(join(root, 'agency-site'))
    await makeLocalWpSite(join(root, 'local-site'))
    await makeGitRepo(join(root, 'local-site'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => [candidate.kind, candidate.isGitRepo])).toEqual([
      ['wordpress', true],
      ['localwp', true]
    ])
  })

  it('excludes configured paths, including a trailing-slash spelling', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'already-added'))
    await makeGitRepo(join(root, 'brand-new'))

    const result = await discoverSiteCandidates({
      roots: [root],
      configuredPaths: [`${join(root, 'already-added')}/`]
    })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['brand-new'])
  })

  it('excludes a configured path spelled with different case on case-insensitive paths', async () => {
    const result = await discoverSiteCandidates({
      roots: ['C:/Sites'],
      configuredPaths: ['c:\\sites\\Alpha\\'],
      filesystem: fakeFilesystem({
        directories: new Map([['C:/Sites', ['Alpha', 'Beta']]]),
        files: new Set(['C:/Sites/Alpha/.git', 'C:/Sites/Beta/.git'])
      })
    })

    expect(result.candidates.map((candidate) => candidate.path)).toEqual(['C:/Sites/Beta'])
  })

  it('skips dotfile directories and known noise directories', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, '.hidden-repo'))
    await makeGitRepo(join(root, 'node_modules'))
    await makeGitRepo(join(root, 'vendor'))
    await makeGitRepo(join(root, 'real-project'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['real-project'])
  })

  it.skipIf(process.platform === 'win32')('skips symlinked directories', async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    await makeGitRepo(join(outside, 'linked-project'))
    await symlink(join(outside, 'linked-project'), join(root, 'linked-project'), 'dir')
    await makeGitRepo(join(root, 'real-project'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['real-project'])
  })

  it('caps the candidate list and reports truncation', async () => {
    const total = SITE_CANDIDATES_MAX + 1
    const names = Array.from(
      { length: total },
      (_unused, index) => `project-${String(index).padStart(4, '0')}`
    )
    const result = await discoverSiteCandidates({
      roots: ['/workspace'],
      configuredPaths: [],
      filesystem: fakeFilesystem({
        directories: new Map([['/workspace', names]]),
        files: new Set(names.map((name) => `/workspace/${name}/.git`))
      })
    })

    expect(result.candidates).toHaveLength(SITE_CANDIDATES_MAX)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation when the cap is reached with nothing left to drop', async () => {
    const names = Array.from(
      { length: SITE_CANDIDATES_MAX },
      (_unused, index) => `project-${String(index).padStart(4, '0')}`
    )
    const result = await discoverSiteCandidates({
      roots: ['/workspace'],
      configuredPaths: [],
      filesystem: fakeFilesystem({
        directories: new Map([['/workspace', [...names, 'not-a-project']]]),
        files: new Set(names.map((name) => `/workspace/${name}/.git`))
      })
    })

    expect(result.candidates).toHaveLength(SITE_CANDIDATES_MAX)
    expect(result.truncated).toBe(false)
  })

  it('skips a root that cannot be read instead of throwing', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'survivor'))
    const missingRoot = join(root, 'ejected-volume', 'gone')

    const result = await discoverSiteCandidates({
      roots: [missingRoot, root],
      configuredPaths: []
    })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['survivor'])
    expect(result.roots).toEqual([missingRoot, root])
  })

  it('returns the candidates found so far when the signal aborts mid-scan', async () => {
    const controller = new AbortController()
    const filesystem = fakeFilesystem({
      directories: new Map([['/workspace', ['alpha', 'beta']]]),
      files: new Set(['/workspace/alpha/.git', '/workspace/beta/.git'])
    })

    const result = await discoverSiteCandidates({
      roots: ['/workspace'],
      configuredPaths: [],
      signal: controller.signal,
      filesystem: {
        ...filesystem,
        pathExists: async (targetPath: string) => {
          if (targetPath.startsWith('/workspace/alpha')) {
            controller.abort()
          }
          return filesystem.pathExists(targetPath)
        }
      }
    })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['alpha'])
  })

  it('returns nothing when the signal is already aborted', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'never-scanned'))

    const result = await discoverSiteCandidates({
      roots: [root],
      configuredPaths: [],
      signal: AbortSignal.abort()
    })

    expect(result.candidates).toEqual([])
  })

  it('sorts candidates by display name without regard to case', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'zeta'))
    await makeGitRepo(join(root, 'Alpha'))
    await makeGitRepo(join(root, 'beta'))

    const result = await discoverSiteCandidates({ roots: [root], configuredPaths: [] })

    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual([
      'Alpha',
      'beta',
      'zeta'
    ])
  })

  it('scans a duplicated root only once', async () => {
    const root = await tempRoot()
    await makeGitRepo(join(root, 'solo'))

    const result = await discoverSiteCandidates({
      roots: [root, `${root}/`],
      configuredPaths: []
    })

    expect(result.roots).toEqual([root])
    expect(result.candidates.map((candidate) => candidate.displayName)).toEqual(['solo'])
  })
})
