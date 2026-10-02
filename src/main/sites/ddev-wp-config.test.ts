import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { patchWpConfigForDdev, prepareWpConfigForDdev } from './ddev-wp-config'

const AGENT_LOCAL_CONFIG = `<?php
define( 'DB_NAME', 'al_alchemy' );
define( 'DB_USER', 'al_alchemy' );
define('DB_PASSWORD', "secret");
define( 'DB_HOST', '127.0.0.1:3307' );
define( 'WP_HOME', 'https://alchemy.local' );
define( 'WP_SITEURL', 'https://alchemy.local' );
define( 'DB_CHARSET', 'utf8' );
$table_prefix = 'wp_';
require_once ABSPATH . 'wp-settings.php';
`

describe('patchWpConfigForDdev', () => {
  it('loads DDEV first and makes the DB and URL constants conditional', () => {
    const patch = patchWpConfigForDdev(AGENT_LOCAL_CONFIG)
    expect(patch.includeAdded).toBe(true)
    expect(patch.deferred).toEqual([
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'DB_HOST',
      'WP_HOME',
      'WP_SITEURL'
    ])
    expect(patch.contents).toContain("defined( 'DB_NAME' ) || define( 'DB_NAME', 'al_alchemy' );")
    expect(patch.contents).toContain(
      `defined( 'DB_PASSWORD' ) || define( 'DB_PASSWORD', "secret");`
    )
    // Untouched: not a constant DDEV sets.
    expect(patch.contents).toContain("\ndefine( 'DB_CHARSET', 'utf8' );")
    const includeAt = patch.contents.indexOf('wp-config-ddev.php')
    expect(includeAt).toBeGreaterThan(0)
    expect(includeAt).toBeLessThan(patch.contents.indexOf("'DB_NAME'"))
    expect(patch.contents.startsWith('<?php\n')).toBe(true)
  })

  it('is idempotent', () => {
    const once = patchWpConfigForDdev(AGENT_LOCAL_CONFIG).contents
    const twice = patchWpConfigForDdev(once)
    expect(twice.contents).toBe(once)
    expect(twice.deferred).toEqual([])
    expect(twice.includeAdded).toBe(false)
  })

  it('leaves DDEV’s own wp-config.php alone', () => {
    const ddevOwn = `<?php
$ddev_settings = __DIR__ . '/wp-config-ddev.php';
if ( ! defined( 'DB_USER' ) && getenv( 'IS_DDEV_PROJECT' ) == 'true' && is_readable( $ddev_settings ) ) {
	require_once( $ddev_settings );
}
`
    expect(patchWpConfigForDdev(ddevOwn).contents).toBe(ddevOwn)
  })
})

describe('prepareWpConfigForDdev', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports a missing file without creating one', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ddev-wpconfig-'))
    await expect(
      prepareWpConfigForDdev(dir, dir, { isTracked: async () => false })
    ).resolves.toEqual({
      action: 'missing'
    })
  })

  it('patches an untracked file and keeps a backup', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ddev-wpconfig-'))
    const file = path.join(dir, 'wp-config.php')
    await writeFile(file, AGENT_LOCAL_CONFIG)
    const outcome = await prepareWpConfigForDdev(dir, dir, { isTracked: async () => false })
    expect(outcome.action).toBe('patched')
    await expect(readFile(`${file}.muster-backup`, 'utf8')).resolves.toBe(AGENT_LOCAL_CONFIG)
    await expect(readFile(file, 'utf8')).resolves.toContain('wp-config-ddev.php')
    await expect(
      prepareWpConfigForDdev(dir, dir, { isTracked: async () => false })
    ).resolves.toEqual({
      action: 'already'
    })
  })

  it('refuses to edit a committed file', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ddev-wpconfig-'))
    const file = path.join(dir, 'wp-config.php')
    await writeFile(file, AGENT_LOCAL_CONFIG)
    const outcome = await prepareWpConfigForDdev(dir, dir, { isTracked: async () => true })
    expect(outcome.action).toBe('tracked')
    await expect(readFile(file, 'utf8')).resolves.toBe(AGENT_LOCAL_CONFIG)
  })
})
