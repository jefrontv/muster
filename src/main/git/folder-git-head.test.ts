import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasGitFeatures } from '../../shared/repo-kind'
import { readFolderGitHead } from './folder-git-head'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

describe('readFolderGitHead', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'folder-git-head-'))
    git(root, 'init', '-q', '-b', 'main')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reports the checked-out branch of a git-backed folder', () => {
    expect(readFolderGitHead({ path: root, gitBacked: true })).toEqual({
      head: '',
      branch: 'refs/heads/main'
    })
  })

  it('reports the detached head', () => {
    git(
      root,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'x'
    )
    const sha = git(root, 'rev-parse', 'HEAD')
    git(root, 'checkout', '-q', '--detach')
    expect(readFolderGitHead({ path: root, gitBacked: true })).toEqual({ head: sha, branch: '' })
  })

  it('follows a .git file to its gitdir', () => {
    const linked = mkdtempSync(join(tmpdir(), 'folder-git-head-linked-'))
    try {
      writeFileSync(join(linked, '.git'), `gitdir: ${join(root, '.git')}\n`)
      expect(readFolderGitHead({ path: linked, gitBacked: true }).branch).toBe('refs/heads/main')
    } finally {
      rmSync(linked, { recursive: true, force: true })
    }
  })

  it('reads nothing for plain folders and remote repos', () => {
    expect(readFolderGitHead({ path: root })).toEqual({ head: '', branch: '' })
    expect(readFolderGitHead({ path: root, gitBacked: true, connectionId: 'ssh-1' })).toEqual({
      head: '',
      branch: ''
    })
  })
})

describe('hasGitFeatures', () => {
  it('is true for git projects and git-backed folders only', () => {
    expect(hasGitFeatures({ kind: 'git' })).toBe(true)
    expect(hasGitFeatures({})).toBe(true)
    expect(hasGitFeatures({ kind: 'folder', gitBacked: true })).toBe(true)
    expect(hasGitFeatures({ kind: 'folder' })).toBe(false)
  })
})
