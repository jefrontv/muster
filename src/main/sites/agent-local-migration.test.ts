import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import {
  isAlreadyRegisteredSite,
  isSourceDatabaseUnreachable,
  planAgentLocalMigration,
  relativeDocroot,
  resolveAgentLocalDocroot,
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

  // A bare theme repo is not a dead end: agent-local attaches it to an empty database, which is
  // what the server import then fills. `create` is the wizard's word for that state.
  it('plans an attach for a checkout with no WordPress in it', () => {
    const plan = planAgentLocalMigration(request({ sitePath: checkout(false) }))

    expect(plan.ok).toBe(true)
    expect(plan.mode).toBe('create')
    // Nothing to rewrite: there is no wp-config.php to point anywhere yet.
    expect(plan.edits).toEqual([])
  })

  it('reads the docroot it will register, not the repo root', () => {
    const repoRoot = checkout(false)
    const docroot = checkout(true)

    expect(planAgentLocalMigration(request({ sitePath: repoRoot })).mode).toBe('create')
    expect(planAgentLocalMigration(request({ sitePath: repoRoot }), docroot).mode).toBe('migrate')
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

  // `/import` copies a database out of wp-config.php, which a bare repo has not got; the daemon
  // itself refuses `POST /sites` on a non-empty folder and points at `/attach`.
  it('attaches a source with no WordPress instead of trying to import one', async () => {
    const calls: { path: string; body: unknown }[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method: string, apiPath: string, body?: unknown) => {
        calls.push({ path: apiPath, body })
        return importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }
    const bare = checkout(false)

    const result = await runAgentLocalMigration(request({ sitePath: bare }), { host: recording })

    expect(result.ok).toBe(true)
    expect(calls[0]?.path).toBe('/attach')
    // `dir`, not `source`: the two endpoints name the folder differently.
    expect(calls[0]?.body).toMatchObject({ dir: bare, domain: 'acme.test' })
  })

  it('imports a source that already has WordPress', async () => {
    const calls: { path: string }[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method: string, apiPath: string) => {
        calls.push({ path: apiPath })
        return importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    await runAgentLocalMigration(request(), { host: recording })

    expect(calls[0]?.path).toBe('/import')
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

  // The live failure: a site whose LocalWP install was gone could not move to Agent Local at all,
  // because /import insists on copying a database from a MySQL that is no longer running.
  it('registers the files when the old database cannot be copied', async () => {
    const calls: string[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method: string, apiPath: string) => {
        calls.push(apiPath)
        return apiPath === '/import'
          ? {
              ok: false,
              status: 500,
              error:
                "copy database pactgroup_wp from 127.0.0.1:3306 as root: dump: exit status 2 (mariadb-dump: Got error: 2002: \"Can't connect to server on '127.0.0.1' (36)\")"
            }
          : importResponse
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    const result = await runAgentLocalMigration(request(), { host: recording })

    expect(calls).toEqual(['/import', '/attach'])
    expect(result.ok).toBe(true)
    // The caller persists this; claiming the database landed would skip the import that has to run.
    expect(result.databaseImported).toBe(false)
    expect(result.message).toContain('empty database')
  })

  it('adopts a leftover Agent Local slug instead of failing site already exists', async () => {
    const result = await runAgentLocalMigration(
      request({ siteName: 'ebes', domain: 'ebes.local' }),
      {
        host: {
          platform: 'darwin',
          homeDir: '/home/test',
          readToken: async () => 'token',
          request: async (_method: string, apiPath: string) => {
            if (apiPath === '/import' || apiPath === '/attach') {
              return { ok: false, status: 409, error: 'site "ebes" already exists' }
            }
            if (apiPath.startsWith('/resolve') || apiPath === '/sites') {
              return {
                ok: true,
                status: 200,
                data:
                  apiPath === '/sites'
                    ? [
                        {
                          slug: 'ebes',
                          work_dir: WORDPRESS_CHECKOUT,
                          wp_dir: WORDPRESS_CHECKOUT,
                          domain: 'ebes.local',
                          php_version: '8.4',
                          state: 'running'
                        }
                      ]
                    : {
                        slug: 'ebes',
                        site: {
                          slug: 'ebes',
                          work_dir: WORDPRESS_CHECKOUT,
                          wp_dir: WORDPRESS_CHECKOUT,
                          domain: 'ebes.local',
                          php_version: '8.4',
                          state: 'running'
                        }
                      }
              }
            }
            return { ok: false, status: 404, error: 'not found' }
          },
          spawnDaemon: async () => undefined,
          sleep: async () => undefined
        }
      }
    )

    expect(result.ok).toBe(true)
    expect(result.domain).toBe('ebes.local')
    expect(result.message).toContain('ebes')
  })

  it('does not attach behind a refusal that is not about the database', async () => {
    const calls: string[] = []
    const recording: AgentLocalHost = {
      platform: 'darwin',
      homeDir: '/home/test',
      readToken: async () => 'token',
      request: async (_method: string, apiPath: string) => {
        calls.push(apiPath)
        return { ok: false, status: 409, error: "domain 'acme.test' is already in use" }
      },
      spawnDaemon: async () => undefined,
      sleep: async () => undefined
    }

    const result = await runAgentLocalMigration(request(), { host: recording })

    expect(calls).toEqual(['/import'])
    expect(result.ok).toBe(false)
    expect(result.message).toContain('already in use')
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

describe('isAlreadyRegisteredSite', () => {
  it('matches the daemon conflict from a leftover slug', () => {
    expect(isAlreadyRegisteredSite('site "ebes" already exists')).toBe(true)
    expect(isAlreadyRegisteredSite("domain 'acme.test' is already in use")).toBe(false)
  })
})

describe('isSourceDatabaseUnreachable', () => {
  it.each([
    // Verbatim from the reported failure, trailing "when trying to connect" included.
    "copy database pactgroup_wp from 127.0.0.1:3306 as root: dump: exit status 2 (mariadb-dump: Got error: 2002: \"Can't connect to server on '127.0.0.1' (36)\" when trying to connect)",
    'copy database acme_wp from 127.0.0.1:3306 as root: dump: exit status 2 (mariadb-dump: Got error: 2002: "Can\'t connect to server")',
    'copy database acme_wp: dump failed: Got error: 2003: connection refused',
    "copy database acme_wp: dump: Unknown database 'acme_wp'"
  ])('treats a failed copy as retryable: %s', (message) => {
    expect(isSourceDatabaseUnreachable(message)).toBe(true)
  })

  it.each([
    "domain 'acme.test' is already in use",
    'source path has no wp-config.php',
    'php 8.3 is not installed'
  ])('leaves a real refusal alone: %s', (message) => {
    expect(isSourceDatabaseUnreachable(message)).toBe(false)
  })
})

describe('resolveAgentLocalDocroot', () => {
  // The live failure: a site that used to be on LocalWP kept `localWpRoot: 'app/public'`, was
  // deleted and re-cloned as a bare theme repo, and agent-local was handed the empty subfolder —
  // so it served a directory holding nothing but a stray .htaccess.
  it('ignores a stored subpath that holds nothing', () => {
    const root = checkout(false)
    mkdirSync(path.join(root, 'app/public'), { recursive: true })
    writeFileSync(path.join(root, 'app/public/.htaccess'), '# leftover')
    writeFileSync(path.join(root, 'package.json'), '{}')

    expect(resolveAgentLocalDocroot(root, 'app/public')).toBe(root)
  })

  it('honours a stored subpath that really holds the install', () => {
    const root = checkout(false)
    mkdirSync(path.join(root, 'app/public'), { recursive: true })
    writeFileSync(path.join(root, 'app/public/wp-load.php'), '<?php')

    expect(resolveAgentLocalDocroot(root, 'app/public')).toBe(path.join(root, 'app/public'))
  })

  it('prefers WordPress at the root over an empty subfolder', () => {
    const root = checkout(true)
    mkdirSync(path.join(root, 'app/public'), { recursive: true })

    expect(resolveAgentLocalDocroot(root, 'app/public')).toBe(root)
  })

  it('keeps a subpath that has files but no core, which is a checkout mid-import', () => {
    const root = checkout(false)
    mkdirSync(path.join(root, 'app/public'), { recursive: true })
    writeFileSync(path.join(root, 'app/public/wp-content'), 'x')

    expect(resolveAgentLocalDocroot(root, 'app/public')).toBe(path.join(root, 'app/public'))
  })

  it('returns the site path when no subpath is stored', () => {
    const root = checkout(true)

    expect(resolveAgentLocalDocroot(root, '')).toBe(root)
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
