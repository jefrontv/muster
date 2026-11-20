import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Site } from '../../shared/site-types'

vi.mock('./agent-local-site-control', () => ({}))
vi.mock('./ddev-site-control', () => ({}))
vi.mock('./local-stack-provider', () => ({ providerFor: vi.fn() }))
vi.mock('./site-secret-store', () => ({ getSiteSecret: vi.fn() }))

const { resolveSiteWpDir } = await import('./site-run-config')

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'muster-wp-dir-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function site(localWpRoot: string): Site {
  return { path: root, localWpRoot } as Site
}

function wordPressAt(...segments: string[]): string {
  const dir = path.join(root, ...segments)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'wp-load.php'), '<?php\n')
  return dir
}

describe('resolveSiteWpDir', () => {
  it('uses the saved subpath when WordPress is there', () => {
    const appPublic = wordPressAt('app', 'public')
    expect(resolveSiteWpDir(site('/app/public/'))).toBe(appPublic)
  })

  it('finds app/public when a LocalWP site was saved with no subpath', () => {
    const appPublic = wordPressAt('app', 'public')
    expect(resolveSiteWpDir(site(''))).toBe(appPublic)
  })

  it('falls back to the site folder when the saved subpath holds no WordPress', () => {
    wordPressAt()
    expect(resolveSiteWpDir(site('app/public'))).toBe(root)
  })

  it('keeps the saved subpath when no WordPress exists yet', () => {
    expect(resolveSiteWpDir(site('app/public'))).toBe(path.join(root, 'app', 'public'))
    expect(resolveSiteWpDir(site(''))).toBe(root)
  })
})
