import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as FsModule from 'node:fs'

const { execFileMock, accessSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  accessSyncMock: vi.fn()
}))

vi.mock('node:child_process', () => ({ execFile: execFileMock }))
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof FsModule>()),
  accessSync: accessSyncMock
}))

import {
  noteLocalGitSpawnFailure,
  resolveDarwinGitBinary,
  resolveLocalGitBinary,
  setDarwinGitBinaryResolutionForTests
} from './darwin-git-binary'

const CLT_GIT = '/Library/Developer/CommandLineTools/usr/bin/git'

function depsFor(executables: string[], xcrun: () => Promise<string>) {
  return {
    pathEnv: '/opt/homebrew/bin:/usr/bin:/bin',
    isExecutable: (filePath: string) => executables.includes(filePath),
    runXcrunFindGit: vi.fn(xcrun)
  }
}

describe('resolveDarwinGitBinary', () => {
  it('keeps a Homebrew git that comes first on PATH', async () => {
    const deps = depsFor(['/opt/homebrew/bin/git', '/usr/bin/git', CLT_GIT], async () => CLT_GIT)
    await expect(resolveDarwinGitBinary(deps)).resolves.toBe('git')
    expect(deps.runXcrunFindGit).not.toHaveBeenCalled()
  })

  it('maps the /usr/bin/git shim to the xcrun-resolved binary', async () => {
    const deps = depsFor(['/usr/bin/git', CLT_GIT], async () => CLT_GIT)
    await expect(resolveDarwinGitBinary(deps)).resolves.toBe(CLT_GIT)
  })

  it('falls back to git when xcrun fails', async () => {
    const deps = depsFor(['/usr/bin/git'], async () => {
      throw new Error('xcrun: error: invalid active developer path')
    })
    await expect(resolveDarwinGitBinary(deps)).resolves.toBe('git')
  })

  it('falls back to git when xcrun returns a path that is not executable', async () => {
    const deps = depsFor(['/usr/bin/git'], async () => CLT_GIT)
    await expect(resolveDarwinGitBinary(deps)).resolves.toBe('git')
  })
})

describe('resolveLocalGitBinary cache', () => {
  const originalPath = process.env.PATH
  let executables: string[]

  beforeEach(() => {
    executables = ['/usr/bin/git', CLT_GIT]
    accessSyncMock.mockImplementation((filePath: string) => {
      if (!executables.includes(filePath)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
    })
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string) => void) =>
        cb(null, `${CLT_GIT}\n`)
    )
    process.env.PATH = '/usr/bin:/bin'
    setDarwinGitBinaryResolutionForTests(true)
  })

  afterEach(() => {
    process.env.PATH = originalPath
    setDarwinGitBinaryResolutionForTests(false)
    execFileMock.mockReset()
    accessSyncMock.mockReset()
  })

  it('returns git until the probe settles, then the resolved binary, probing once', async () => {
    expect(resolveLocalGitBinary()).toBe('git')
    await vi.waitFor(() => expect(resolveLocalGitBinary()).toBe(CLT_GIT))
    resolveLocalGitBinary()
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('re-probes when PATH changes so a hydrated Homebrew git wins', async () => {
    resolveLocalGitBinary()
    await vi.waitFor(() => expect(resolveLocalGitBinary()).toBe(CLT_GIT))
    executables.push('/opt/homebrew/bin/git')
    process.env.PATH = '/opt/homebrew/bin:/usr/bin:/bin'
    expect(resolveLocalGitBinary()).toBe('git')
    await Promise.resolve()
    expect(resolveLocalGitBinary()).toBe('git')
  })

  it('drops the cache when the resolved binary disappears', async () => {
    resolveLocalGitBinary()
    await vi.waitFor(() => expect(resolveLocalGitBinary()).toBe(CLT_GIT))
    executables = ['/usr/bin/git']
    noteLocalGitSpawnFailure(CLT_GIT, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
    expect(resolveLocalGitBinary()).toBe('git')
    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the cache when a spawn fails for another reason', async () => {
    resolveLocalGitBinary()
    await vi.waitFor(() => expect(resolveLocalGitBinary()).toBe(CLT_GIT))
    // A deleted cwd also reports ENOENT; the binary itself is still there.
    noteLocalGitSpawnFailure(CLT_GIT, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
    expect(resolveLocalGitBinary()).toBe(CLT_GIT)
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
