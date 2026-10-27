import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findDeepestWorkspaceForPath, resolveLocalOpenPath } from './workspace-open-path'

const repo = { id: 'r1::/work/site', repoId: 'r1', path: '/work/site' }
const worktree = { id: 'r1::/work/site-feature', repoId: 'r1', path: '/work/site-feature' }
const nested = { id: 'r2::/work/site/packages/ui', repoId: 'r2', path: '/work/site/packages/ui' }

describe('findDeepestWorkspaceForPath', () => {
  it('matches the folder itself and anything inside it', () => {
    expect(findDeepestWorkspaceForPath([repo], ['/work/site'])).toBe(repo)
    expect(findDeepestWorkspaceForPath([repo], ['/work/site/wp-content/themes'])).toBe(repo)
  })

  it('does not treat a sibling with a shared prefix as inside', () => {
    expect(findDeepestWorkspaceForPath([repo], ['/work/site-feature/src'])).toBeNull()
    expect(findDeepestWorkspaceForPath([repo, worktree], ['/work/site-feature/src'])).toBe(worktree)
  })

  it('prefers the deepest workspace that contains the path', () => {
    expect(findDeepestWorkspaceForPath([repo, nested], ['/work/site/packages/ui/src'])).toBe(nested)
    expect(findDeepestWorkspaceForPath([nested, repo], ['/work/site/packages'])).toBe(repo)
  })

  it('prefers the root folder workspace over instances at the same path', () => {
    const instance = { id: 'r1::/work/site#instance-2', repoId: 'r1', path: '/work/site' }
    expect(findDeepestWorkspaceForPath([instance, repo], ['/work/site'])).toBe(repo)
  })

  it('accepts any of several spellings of the target, like a symlink and its real path', () => {
    expect(findDeepestWorkspaceForPath([repo], ['/private/work/site', '/work/site/'])).toBe(repo)
  })
})

describe('resolveLocalOpenPath', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('returns the real path of a folder', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'muster-open-path-'))
    const folder = join(tempDir, 'site')
    mkdirSync(folder)
    expect(resolveLocalOpenPath(folder)).toBe(realpathSync.native(folder))
  })

  it('rejects a missing path and a file with the path in the message', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'muster-open-path-'))
    const file = join(tempDir, 'notes.txt')
    writeFileSync(file, 'x')
    expect(() => resolveLocalOpenPath(join(tempDir!, 'nope'))).toThrow(
      `No such folder: ${join(tempDir, 'nope')}`
    )
    expect(() => resolveLocalOpenPath(file)).toThrow(`Not a folder: ${file}`)
  })
})
