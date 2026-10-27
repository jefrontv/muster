import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  expandHomePath,
  formatWorkspaceOpenPath,
  rewriteBarePathInvocation
} from './open-path-command'

const COMMANDS = new Set(['open', 'status', 'repo', 'worktree'])

describe('rewriteBarePathInvocation', () => {
  let tempDir: string | null = null

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = null
    }
  })

  it('maps path-shaped first arguments to open', () => {
    expect(rewriteBarePathInvocation(['.'], '/cwd', COMMANDS)).toEqual(['open', '.'])
    expect(rewriteBarePathInvocation(['..', '--json'], '/cwd', COMMANDS)).toEqual([
      'open',
      '..',
      '--json'
    ])
    expect(rewriteBarePathInvocation(['/srv/site'], '/cwd', COMMANDS)).toEqual([
      'open',
      '/srv/site'
    ])
    expect(rewriteBarePathInvocation(['~/Sites/a'], '/cwd', COMMANDS)).toEqual([
      'open',
      '~/Sites/a'
    ])
    expect(rewriteBarePathInvocation(['C:\\work'], '/cwd', COMMANDS)).toEqual(['open', 'C:\\work'])
  })

  it('maps an existing folder name relative to cwd', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'muster-bare-path-'))
    mkdirSync(join(tempDir, 'my-site'))
    expect(rewriteBarePathInvocation(['my-site'], tempDir, COMMANDS)).toEqual(['open', 'my-site'])
  })

  it('leaves commands, typos and flags alone', () => {
    expect(rewriteBarePathInvocation(['status'], '/cwd', COMMANDS)).toEqual(['status'])
    expect(rewriteBarePathInvocation(['stauts'], '/cwd', COMMANDS)).toEqual(['stauts'])
    expect(rewriteBarePathInvocation(['--help'], '/cwd', COMMANDS)).toEqual(['--help'])
    expect(rewriteBarePathInvocation([], '/cwd', COMMANDS)).toEqual([])
  })

  it('lets a command win over a folder with the same name', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'muster-bare-path-'))
    mkdirSync(join(tempDir, 'status'))
    expect(rewriteBarePathInvocation(['status'], tempDir, COMMANDS)).toEqual(['status'])
  })
})

describe('expandHomePath', () => {
  it('expands a leading tilde only', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/Sites')).toBe(join(homedir(), 'Sites'))
    expect(expandHomePath('./~/x')).toBe('./~/x')
    expect(expandHomePath('~other/x')).toBe('~other/x')
  })
})

describe('formatWorkspaceOpenPath', () => {
  it('names the project, and the worktree when it differs', () => {
    const repo = { id: 'r1', displayName: 'site', path: '/work/site' }
    expect(
      formatWorkspaceOpenPath({
        outcome: 'imported',
        kind: 'folder',
        repo,
        worktree: { id: 'r1::/work/site', displayName: 'site', path: '/work/site' }
      })
    ).toBe('Added and opened site\n/work/site')
    expect(
      formatWorkspaceOpenPath({
        outcome: 'focused',
        kind: 'git',
        repo,
        worktree: { id: 'r1::/work/feat', displayName: 'feat', path: '/work/feat' }
      })
    ).toBe('Opened feat (site)\n/work/feat')
  })
})
