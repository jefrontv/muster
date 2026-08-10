import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import {
  planAgentLocalMigration,
  relativeDocroot,
  runAgentLocalMigration
} from './agent-local-migration'
import type { LocalWpMigrationRequest } from './localwp-migration-plan'

/** A real folder, because the plan's only gate is whether wp-load.php is actually there. */
function checkout(withWordPress: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'muster-agent-local-'))
  if (withWordPress) {
    writeFileSync(path.join(dir, 'wp-load.php'), '<?php')
  }
  return dir
}

const WORDPRESS_CHECKOUT = checkout(true)

function request(overrides: Partial<LocalWpMigrationRequest> = {}): LocalWpMigrationRequest {
  return {
    sitePath: WORDPRESS_CHECKOUT,
    siteName: 'Acme',
    domain: 'acme.test',
    adminEmail: '',
    adminPassword: '',
    ...overrides
  }
}

function host(response: AgentLocalResponse, platform = 'darwin'): AgentLocalHost {
  return {
    platform,
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async () => response,
    spawnDaemon: async () => undefined,
    sleep: async () => undefined
  }
}

describe('planAgentLocalMigration', () => {
  it('promises no moves and no deletions, because agent-local serves in place', () => {
    const plan = planAgentLocalMigration(request())

    expect(plan.ok).toBe(true)
    expect(plan.moves).toEqual([])
    // The renderer's confirmation exists to warn about LocalWP deleting app/public. Showing that
    // warning for a migration that deletes nothing would train the user to click through it.
    expect(plan.appPublicEntries).toEqual([])
    expect(plan.wordPressRoot).toBe(WORDPRESS_CHECKOUT)
  })

  // The failure this pins: a theme-only checkout previewed as fine, the user pressed the button,
  // and the daemon failed partway through with "missing wp-load.php".
  it('blocks a checkout with no WordPress in it', () => {
    const bare = checkout(false)

    const plan = planAgentLocalMigration(request({ sitePath: bare }))

    expect(plan.ok).toBe(false)
    expect(plan.blockedReason).toContain('wp-load.php is missing')
    expect(plan.blockedReason).toContain(bare)
  })

  it('gates on the docroot it will register, not the repo root', () => {
    const repoRoot = checkout(false)
    const docroot = checkout(true)

    expect(planAgentLocalMigration(request({ sitePath: repoRoot })).ok).toBe(false)
    expect(planAgentLocalMigration(request({ sitePath: repoRoot }), docroot).ok).toBe(true)
  })
})

describe('runAgentLocalMigration', () => {
  const importResponse: AgentLocalResponse = {
    ok: true,
    status: 200,
    data: {
      slug: 'acme',
      domain: 'acme.test',
      wp_dir: path.join(WORDPRESS_CHECKOUT, 'app/public'),
      php_version: '8.3',
      db: { port: 10360, name: 'al_acme', user: 'al_acme', pass: 'secret' }
    }
  }

  it('maps the response onto Muster fields, deriving the docroot rather than assuming one', async () => {
    const result = await runAgentLocalMigration(request(), { host: host(importResponse) })

    expect(result).toMatchObject({
      ok: true,
      localWpRoot: 'app/public',
      domain: 'acme.test',
      dbPort: 10360,
      dbUser: 'al_acme',
      phpVersion: '8.3',
      socketPath: ''
    })
  })

  it('never puts the database password in the result or the log', async () => {
    const result = await runAgentLocalMigration(request(), { host: host(importResponse) })

    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('registers the docroot, not the repo root', async () => {
    // agent-local reads wp-config.php from whatever it is given, so a repo root whose WordPress
    // lives in `wp/` fails with "missing wp-load.php" — which is exactly what happened live.
    const sent: unknown[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method, _path, body) => {
        sent.push(body)
        return importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    // A real docroot: the run now refuses a source with no WordPress in it, so a made-up path
    // would be rejected before the request is ever built.
    const docroot = checkout(true)

    await runAgentLocalMigration(request(), { host: recording, sourcePath: docroot })

    expect((sent[0] as { source: string }).source).toBe(docroot)
  })

  it('refuses a source with no WordPress instead of letting the daemon fail mid-import', async () => {
    let called = false
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async () => {
        called = true
        return importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    const result = await runAgentLocalMigration(request({ sitePath: checkout(false) }), {
      host: recording
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('wp-load.php is missing')
    expect(called).toBe(false)
  })

  it('falls back to the site path when there is no subpath', async () => {
    const sent: unknown[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method, _path, body) => {
        sent.push(body)
        return importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    await runAgentLocalMigration(request(), { host: recording })

    expect((sent[0] as { source: string }).source).toBe(WORDPRESS_CHECKOUT)
  })

  it('reports the daemon error instead of throwing', async () => {
    const failure = await runAgentLocalMigration(request(), {
      host: host({ ok: false, status: 500, error: 'source path has no wp-config.php' })
    })

    expect(failure).toMatchObject({ ok: false, message: 'source path has no wp-config.php' })
  })

  it('is unsupported off macOS', async () => {
    const result = await runAgentLocalMigration(request(), {
      host: host(importResponse, 'win32')
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS')
  })
})

describe('relativeDocroot', () => {
  it.each([
    ['/Sites/acme', '/Sites/acme/app/public', 'app/public'],
    ['/Sites/acme', '/Sites/acme/wp', 'wp'],
    ['/Sites/acme', '/Sites/acme', ''],
    ['/Sites/acme', '', '']
  ])('%s + %s -> %s', (sitePath, wpDir, expected) => {
    expect(relativeDocroot(sitePath, wpDir)).toBe(expected)
  })

  it('refuses a docroot outside the site path rather than storing a ".." offset', () => {
    // resolveSiteWpDir joins this onto site.path, so a '..' would send the file tree out of the repo.
    expect(relativeDocroot('/Sites/acme', '/Sites/other/public')).toBe('')
  })
})
