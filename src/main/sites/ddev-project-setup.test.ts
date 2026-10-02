import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDdevHost } from './ddev-host'
import {
  chooseDdevProjectName,
  ddevNameFromDomain,
  planDdevSetup,
  readWorktreeInfo,
  slugifyDdevName
} from './ddev-project-setup'

describe('names', () => {
  it('slugifies folders and branches into DDEV names', () => {
    expect(slugifyDdevName('seafarers-residences.com.au-om')).toBe('seafarers-residences-com-au-om')
    expect(slugifyDdevName('Feature/Calculator Updates')).toBe('feature-calculator-updates')
    expect(slugifyDdevName('...')).toBe('site')
  })

  it('takes the first label of a typed domain', () => {
    expect(ddevNameFromDomain('alchemy.ddev.site:8843')).toBe('alchemy')
    expect(ddevNameFromDomain('https://glitz.local')).toBe('glitz')
  })

  it('adds a suffix when another folder already holds the name', async () => {
    const host = createDdevHost({
      homeDir: '/Users/me',
      readText: async () => 'alchemy:\n    approot: /Users/me/Sites/alchemy\n'
    })
    await expect(chooseDdevProjectName(host, '/Users/me/Sites/alchemy', 'alchemy')).resolves.toBe(
      'alchemy'
    )
    await expect(chooseDdevProjectName(host, '/Users/me/Sites/other', 'alchemy')).resolves.toBe(
      'alchemy-2'
    )
  })
})

describe('readWorktreeInfo', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reads the main checkout name and branch of a linked worktree', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ddev-wt-'))
    const gitDir = path.join(dir, 'glitz', '.git', 'worktrees', 'glitz-feature')
    await mkdir(gitDir, { recursive: true })
    await writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/new-header\n')
    const worktree = path.join(dir, 'glitz-feature')
    await mkdir(worktree)
    await writeFile(path.join(worktree, '.git'), `gitdir: ${gitDir}\n`)
    await expect(readWorktreeInfo(worktree)).resolves.toEqual({
      repoName: 'glitz',
      branch: 'feature/new-header'
    })
  })

  it('answers null for a main checkout', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ddev-wt-'))
    await mkdir(path.join(dir, '.git'))
    await expect(readWorktreeInfo(dir)).resolves.toBeNull()
  })
})

describe('planDdevSetup', () => {
  const request = {
    sitePath: '/Users/me/Sites/timberline',
    siteName: 'timberline',
    domain: 'timberline.ddev.site',
    adminEmail: '',
    adminPassword: ''
  }

  it('plans core download for a theme-only clone', () => {
    const plan = planDdevSetup(request, '/Users/me/Sites/timberline/app/public', {
      hasConfig: false,
      hasWordPress: false,
      projectName: 'timberline',
      tld: 'ddev.site'
    })
    expect(plan.mode).toBe('create')
    expect(plan.domain).toBe('timberline.ddev.site')
    expect(plan.steps[0]).toContain('docroot app/public')
    expect(plan.steps).toContain('Download WordPress core into the docroot')
  })

  it('plans the wp-config.php patch for an existing install', () => {
    const plan = planDdevSetup(request, request.sitePath, {
      hasConfig: true,
      hasWordPress: true,
      projectName: 'timberline',
      tld: 'ddev.site'
    })
    expect(plan.mode).toBe('migrate')
    expect(plan.edits).toEqual(['/Users/me/Sites/timberline/wp-config.php'])
  })
})
