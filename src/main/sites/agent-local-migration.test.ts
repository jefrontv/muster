import { describe, expect, it } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import {
  planAgentLocalMigration,
  relativeDocroot,
  runAgentLocalMigration
} from './agent-local-migration'
import type { LocalWpMigrationRequest } from './localwp-migration-plan'

function request(overrides: Partial<LocalWpMigrationRequest> = {}): LocalWpMigrationRequest {
  return {
    sitePath: '/Sites/acme',
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
    expect(plan.wordPressRoot).toBe('/Sites/acme')
  })
})

describe('runAgentLocalMigration', () => {
  const importResponse: AgentLocalResponse = {
    ok: true,
    status: 200,
    data: {
      slug: 'acme',
      domain: 'acme.test',
      wp_dir: '/Sites/acme/app/public',
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
