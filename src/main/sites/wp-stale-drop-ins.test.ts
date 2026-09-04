import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'
import {
  cleanUpStaleDropIns,
  dropInPointsElsewhere,
  STALE_DROP_IN_SUFFIX
} from './wp-stale-drop-ins'

const PRODUCTION_ROCKET = `<?php
define( 'WP_ROCKET_ADVANCED_CACHE', true );
$rocket_path = '/home/newark/public_html/wp-content/plugins/wp-rocket/';
$rocket_config = [ 'cache_dir_path' => '/home/newark/public_html/wp-content/cache/wp-rocket/' ];
`

function localRocket(wpDir: string): string {
  return `<?php\n$rocket_path = '${wpDir}/wp-content/plugins/wp-rocket/';\n`
}

describe('dropInPointsElsewhere', () => {
  it('flags a drop-in naming a server path, and not one naming this checkout', () => {
    expect(dropInPointsElsewhere(PRODUCTION_ROCKET, '/Users/jake/Sites/newarkom')).toBe(true)
    expect(
      dropInPointsElsewhere(localRocket('/Users/jake/Sites/newarkom'), '/Users/jake/Sites/newarkom')
    ).toBe(false)
  })

  it('ignores URL paths and drop-ins with no filesystem path at all', () => {
    expect(dropInPointsElsewhere(`<?php $url = '/wp-content/cache/';`, '/Users/jake/Sites/x')).toBe(
      false
    )
    expect(dropInPointsElsewhere(`<?php return;`, '/Users/jake/Sites/x')).toBe(false)
  })
})

describe('cleanUpStaleDropIns', () => {
  let dir = ''
  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function harness(): { context: SiteRunContext & { logs: string[] }; config: SiteRunConfig } {
    dir = mkdtempSync(path.join(tmpdir(), 'drop-ins-'))
    const logs: string[] = []
    return {
      context: {
        signal: new AbortController().signal,
        log: (line) => logs.push(line),
        status: () => undefined,
        progress: () => undefined,
        throwIfCancelled: () => undefined,
        logs
      },
      config: { wpDir: dir } as SiteRunConfig
    }
  }

  it('sets a production drop-in aside and keeps a local one', async () => {
    const { context, config } = harness()
    const content = path.join(dir, 'wp-content')
    mkdirSync(content)
    writeFileSync(path.join(content, 'advanced-cache.php'), PRODUCTION_ROCKET)
    writeFileSync(path.join(content, 'object-cache.php'), localRocket(dir))

    await cleanUpStaleDropIns(context, config)

    expect(existsSync(path.join(content, 'advanced-cache.php'))).toBe(false)
    expect(
      readFileSync(path.join(content, `advanced-cache.php${STALE_DROP_IN_SUFFIX}`), 'utf8')
    ).toBe(PRODUCTION_ROCKET)
    expect(existsSync(path.join(content, 'object-cache.php'))).toBe(true)
    expect(context.logs).toHaveLength(1)
    expect(context.logs[0]).toContain('advanced-cache.php')
    expect(context.logs[0]).toContain('production paths')
  })

  it('does nothing, quietly, when there are no drop-ins', async () => {
    const { context, config } = harness()
    await cleanUpStaleDropIns(context, config)
    expect(context.logs).toEqual([])
  })
})
