import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeContext, siteRecord } from './site-mcp-fake-context'
import { resolveMcpLocalWp } from './site-mcp-wp-target'

let root = ''

afterEach(() => {
  if (root) {
    rmSync(root, { recursive: true, force: true })
  }
})

// A site moved off LocalWP onto DDEV kept `app/public`; WP-CLI then failed as `spawn wp ENOENT`.
describe('resolveMcpLocalWp', () => {
  it('names the missing WordPress root and the fix instead of a spawn error', () => {
    root = mkdtempSync(path.join(tmpdir(), 'mcp-wp-'))
    writeFileSync(path.join(root, 'wp-load.php'), '<?php')
    const site = siteRecord({ path: root, localWpRoot: 'app/public', localStack: 'ddev' })
    const context = createFakeContext([site])
    expect(() => resolveMcpLocalWp(context, { site: site.id })).toThrow(
      /WordPress root .*app\/public does not exist.*set localWpRoot to ''/
    )
  })

  it('resolves a root that exists', () => {
    root = mkdtempSync(path.join(tmpdir(), 'mcp-wp-'))
    mkdirSync(path.join(root, 'web'))
    const site = siteRecord({ path: root, localWpRoot: 'web', localStack: 'ddev' })
    const context = createFakeContext([site])
    expect(resolveMcpLocalWp(context, { site: site.id }).wpDir).toBe(path.join(root, 'web'))
  })
})
