import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type * as FsPromisesModule from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The probe takes paths and nothing else, by design — no filesystem seam to inject. Two of its
// promises are only observable at the read boundary though: that concurrency stays bounded, and
// that an abort stops the sweep. So readFile is wrapped with a counter and every other call stays
// real, which keeps each case running against a genuine `.git` layout in a temp directory.
const readFileGate = vi.hoisted(() => ({
  inFlight: 0,
  maxInFlight: 0,
  onRead: null as (() => void) | null
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>()
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    readFileGate.inFlight += 1
    readFileGate.maxInFlight = Math.max(readFileGate.maxInFlight, readFileGate.inFlight)
    readFileGate.onRead?.()
    try {
      return await actual.readFile(...args)
    } finally {
      readFileGate.inFlight -= 1
    }
  }) as typeof actual.readFile
  return { ...actual, readFile }
})

import { probeRepoRemoteKeys } from './repo-remote-probe'

let tempDirs: string[] = []

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-repo-remote-probe-'))
  tempDirs.push(dir)
  return dir
}

/** Writes a git directory at `gitDir` holding `config`; `.git` itself is what the caller names. */
async function writeGitConfig(gitDir: string, body: string): Promise<void> {
  await mkdir(gitDir, { recursive: true })
  await writeFile(join(gitDir, 'config'), body)
}

function originConfig(url: string): string {
  return `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`
}

const WEBSITE_SSH = 'git@bitbucket.org:acme/website.git'
const WEBSITE_KEY = 'bitbucket.org/acme/website'

beforeEach(() => {
  readFileGate.inFlight = 0
  readFileGate.maxInFlight = 0
  readFileGate.onRead = null
})

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('probeRepoRemoteKeys', () => {
  it('reads the origin remote out of a top-level .git directory', async () => {
    const root = await tempRoot()
    await writeGitConfig(join(root, 'website', '.git'), originConfig(WEBSITE_SSH))

    expect(await probeRepoRemoteKeys([join(root, 'website')])).toEqual(new Set([WEBSITE_KEY]))
  })

  // The case the module exists for: Local puts the checkout two levels down, so the site folder
  // itself has no `.git` at all.
  it('finds the repository a LocalWP site keeps under app/public', async () => {
    const root = await tempRoot()
    const sitePath = join(root, '117pacific')
    await writeGitConfig(join(sitePath, 'app', 'public', '.git'), originConfig(WEBSITE_SSH))

    expect(await probeRepoRemoteKeys([sitePath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('falls through to the nested repository when the top-level config names no remote', async () => {
    const root = await tempRoot()
    const sitePath = join(root, 'migrated-site')
    await writeGitConfig(join(sitePath, '.git'), '[core]\n\tbare = false\n')
    await writeGitConfig(join(sitePath, 'app', 'public', '.git'), originConfig(WEBSITE_SSH))

    expect(await probeRepoRemoteKeys([sitePath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('prefers origin over a remote declared before it', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'website')
    await writeGitConfig(
      join(repoPath, '.git'),
      '[remote "backup"]\n\turl = git@github.com:acme/backup.git\n' +
        `[remote "origin"]\n\turl = ${WEBSITE_SSH}\n`
    )

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('uses the first remote when the config has no origin', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'website')
    await writeGitConfig(
      join(repoPath, '.git'),
      '[remote "backup"]\n\turl = git@github.com:acme/backup.git\n' +
        '[remote "mirror"]\n\turl = git@github.com:acme/mirror.git\n'
    )

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set(['github.com/acme/backup']))
  })

  it('reads a config written with loose spacing and inline comments', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'website')
    await writeGitConfig(
      join(repoPath, '.git'),
      [
        '# hand-edited',
        '[remote "origin"]   ; the one that counts',
        `    url   =   ${WEBSITE_SSH}   # kept in sync by hand`,
        ''
      ].join('\n')
    )

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('follows a .git file pointing at an absolute gitdir', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'plugin')
    const gitDir = join(root, 'modules', 'plugin')
    await writeGitConfig(gitDir, originConfig(WEBSITE_SSH))
    await mkdir(repoPath, { recursive: true })
    await writeFile(join(repoPath, '.git'), `gitdir: ${gitDir}\n`)

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('resolves a relative gitdir against the directory holding the .git file', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'plugin')
    await writeGitConfig(join(root, '.git', 'modules', 'plugin'), originConfig(WEBSITE_SSH))
    await mkdir(repoPath, { recursive: true })
    await writeFile(join(repoPath, '.git'), 'gitdir: ../.git/modules/plugin\n')

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set([WEBSITE_KEY]))
  })

  it('stops after one hop rather than chasing a pointer to another pointer', async () => {
    const root = await tempRoot()
    const repoPath = join(root, 'plugin')
    const realGitDir = join(root, 'real')
    const pointerFile = join(root, 'pointer')
    await writeGitConfig(realGitDir, originConfig(WEBSITE_SSH))
    await writeFile(pointerFile, `gitdir: ${realGitDir}\n`)
    await mkdir(repoPath, { recursive: true })
    await writeFile(join(repoPath, '.git'), `gitdir: ${pointerFile}\n`)

    expect(await probeRepoRemoteKeys([repoPath])).toEqual(new Set())
  })

  it('yields nothing for paths that are not there', async () => {
    const root = await tempRoot()

    expect(await probeRepoRemoteKeys([join(root, 'gone'), ''])).toEqual(new Set())
    expect(await probeRepoRemoteKeys([])).toEqual(new Set())
  })

  it('yields nothing for a git directory whose config is missing, unreadable or garbage', async () => {
    const root = await tempRoot()
    const noConfig = join(root, 'no-config')
    await mkdir(join(noConfig, '.git'), { recursive: true })
    const unreadable = join(root, 'unreadable')
    // A directory where the config file belongs: readable as a name, never as bytes.
    await mkdir(join(unreadable, '.git', 'config'), { recursive: true })
    const garbage = join(root, 'garbage')
    await writeGitConfig(join(garbage, '.git'), '\u0000\u0001\u0002 not ini at all\n')

    expect(await probeRepoRemoteKeys([noConfig, unreadable, garbage])).toEqual(new Set())
  })

  // normalizeGitRemoteUrl returns null for these: they name no host, so they can never match a repo
  // a git host offered in the picker.
  it('skips a remote that points at the local filesystem', async () => {
    const root = await tempRoot()
    const fileUrlRepo = join(root, 'mirror')
    const localPathRepo = join(root, 'copy')
    await writeGitConfig(join(fileUrlRepo, '.git'), originConfig('file:///srv/git/website.git'))
    await writeGitConfig(join(localPathRepo, '.git'), originConfig('/srv/git/website.git'))

    expect(await probeRepoRemoteKeys([fileUrlRepo, localPathRepo])).toEqual(new Set())
  })

  it('folds ssh and https spellings of one remote into a single key', async () => {
    const root = await tempRoot()
    const sshClone = join(root, 'ssh-clone')
    const httpsClone = join(root, 'https-clone')
    await writeGitConfig(join(sshClone, '.git'), originConfig('git@github.com:Acme/Website.git'))
    await writeGitConfig(join(httpsClone, '.git'), originConfig('https://GitHub.com/Acme/Website'))

    expect(await probeRepoRemoteKeys([sshClone, httpsClone])).toEqual(
      new Set(['github.com/Acme/Website'])
    )
  })

  it('never holds more reads in flight than the concurrency bound', async () => {
    const root = await tempRoot()
    const repoPaths = await Promise.all(
      Array.from({ length: 12 }, async (_unused, index) => {
        const repoPath = join(root, `repo-${index}`)
        await writeGitConfig(
          join(repoPath, '.git'),
          originConfig(`git@github.com:acme/repo-${index}.git`)
        )
        return repoPath
      })
    )

    const keys = await probeRepoRemoteKeys(repoPaths, { concurrency: 3 })

    expect(keys.size).toBe(12)
    expect(readFileGate.maxInFlight).toBe(3)
  })

  it('returns what it already found when the signal aborts mid-sweep', async () => {
    const root = await tempRoot()
    const first = join(root, 'first')
    const second = join(root, 'second')
    await writeGitConfig(join(first, '.git'), originConfig('git@github.com:acme/first.git'))
    await writeGitConfig(join(second, '.git'), originConfig('git@github.com:acme/second.git'))
    const controller = new AbortController()
    readFileGate.onRead = () => controller.abort()

    const keys = await probeRepoRemoteKeys([first, second], {
      concurrency: 1,
      signal: controller.signal
    })

    expect(keys).toEqual(new Set(['github.com/acme/first']))
  })
})
