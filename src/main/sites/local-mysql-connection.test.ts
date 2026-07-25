import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import {
  buildLocalMysqlConnectionOptions,
  checkLocalMysqlConnection,
  getActiveThemeFromLocalDb,
  localMysqlTargetForSite,
  readLocalTablePrefix,
  type LocalMysqlConnectionOptions,
  type LocalMysqlConnector
} from './local-mysql-connection'
import { SiteRunStepError, type SiteRunConfig } from './pipeline-contract'

let wpDir = ''
let bareDir = ''

function createSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    path: '/sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: 'app/public',
    localDomain: 'acme.local',
    localStack: 'localwp',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...overrides
  }
}

function createConfig(site: Partial<Site> = {}, dbPassword = 'local-pass'): SiteRunConfig {
  const resolved = createSite(site)
  return {
    site: resolved,
    environmentName: 'main',
    environment: resolved.environments.main,
    group: 'import',
    wpDir,
    sshPassword: '',
    dbPassword
  }
}

type Recorded = { options: LocalMysqlConnectionOptions[]; queries: string[]; ended: number }

function createConnector(
  result: unknown,
  failWith?: Error
): { connect: LocalMysqlConnector; recorded: Recorded } {
  const recorded: Recorded = { options: [], queries: [], ended: 0 }
  const connect: LocalMysqlConnector = async (options) => {
    recorded.options.push(options)
    if (failWith) {
      throw failWith
    }
    return {
      query: async (sql) => {
        recorded.queries.push(sql)
        return result
      },
      end: async () => {
        recorded.ended += 1
      }
    }
  }
  return { connect, recorded }
}

beforeAll(() => {
  wpDir = mkdtempSync(join(tmpdir(), 'muster-local-mysql-'))
  bareDir = mkdtempSync(join(tmpdir(), 'muster-local-mysql-bare-'))
  writeFileSync(join(wpDir, 'wp-config.php'), "<?php\n$table_prefix = 'acme_';\n")
})

afterAll(() => {
  for (const directory of [wpDir, bareDir]) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('buildLocalMysqlConnectionOptions', () => {
  it('selects the Unix socket when one is configured', () => {
    expect(
      buildLocalMysqlConnectionOptions({
        user: 'root',
        password: 'root',
        socketPath: '/Users/me/Library/.../mysqld.sock'
      })
    ).toEqual({
      user: 'root',
      password: 'root',
      connectTimeout: 5_000,
      socketPath: '/Users/me/Library/.../mysqld.sock'
    })
  })

  it('never mixes a host into a socket connection', () => {
    const options = buildLocalMysqlConnectionOptions({
      user: 'root',
      password: 'root',
      socketPath: '/tmp/mysqld.sock',
      port: 8889
    })
    expect(options.host).toBeUndefined()
    expect(options.port).toBeUndefined()
  })

  it('falls back to loopback TCP when there is no socket', () => {
    expect(buildLocalMysqlConnectionOptions({ user: 'root', password: 'root' })).toEqual({
      user: 'root',
      password: 'root',
      connectTimeout: 5_000,
      host: '127.0.0.1'
    })
  })

  it('adds the port MAMP and DBngin need', () => {
    const options = buildLocalMysqlConnectionOptions({ user: 'r', password: 'r', port: 8889 })
    expect(options).toMatchObject({ host: '127.0.0.1', port: 8889 })
  })

  it('treats a whitespace-only socket as no socket', () => {
    const options = buildLocalMysqlConnectionOptions({ user: 'r', password: 'r', socketPath: '  ' })
    expect(options.socketPath).toBeUndefined()
    expect(options.host).toBe('127.0.0.1')
  })

  it('omits the database unless one was asked for', () => {
    expect(buildLocalMysqlConnectionOptions({ user: 'r', password: 'r' }).database).toBeUndefined()
    expect(
      buildLocalMysqlConnectionOptions({ user: 'r', password: 'r', database: 'acme' }).database
    ).toBe('acme')
  })
})

describe('localMysqlTargetForSite', () => {
  it('takes the user and transport from the site and the password from the run config', () => {
    const config = createConfig({ dbUser: 'wp', dbSocket: '/tmp/s.sock', dbPort: 3307 }, 'secret')
    expect(localMysqlTargetForSite(config)).toEqual({
      user: 'wp',
      password: 'secret',
      socketPath: '/tmp/s.sock',
      port: 3307
    })
  })
})

describe('checkLocalMysqlConnection', () => {
  it('connects with no database selected and closes again', async () => {
    const { connect, recorded } = createConnector([])
    await checkLocalMysqlConnection(createConfig({ dbSocket: '/tmp/s.sock' }), connect)
    expect(recorded.options).toEqual([
      {
        user: 'root',
        password: 'local-pass',
        connectTimeout: 5_000,
        socketPath: '/tmp/s.sock'
      }
    ])
    expect(recorded.ended).toBe(1)
  })

  it('names the socket and user, and tells the user what to do', async () => {
    const { connect } = createConnector(null, new Error('ECONNREFUSED'))
    await expect(
      checkLocalMysqlConnection(createConfig({ dbSocket: '/tmp/dead.sock', dbUser: 'wp' }), connect)
    ).rejects.toThrow(
      'Cannot connect to local MySQL (socket /tmp/dead.sock, user: wp): ECONNREFUSED — make sure your local MySQL server is running before importing.'
    )
  })

  it('names 127.0.0.1 for a TCP stack', async () => {
    const { connect } = createConnector(null, new Error('connect ECONNREFUSED'))
    await expect(checkLocalMysqlConnection(createConfig(), connect)).rejects.toThrow(
      /\(127\.0\.0\.1, user: root\)/
    )
  })

  it('raises a step error, not a bare driver error', async () => {
    const { connect } = createConnector(null, new Error('nope'))
    await expect(checkLocalMysqlConnection(createConfig(), connect)).rejects.toBeInstanceOf(
      SiteRunStepError
    )
  })

  it('redacts the password if a driver ever echoes it back', async () => {
    const { connect } = createConnector(null, new Error("Access denied using 'topsecret'"))
    await expect(checkLocalMysqlConnection(createConfig({}, 'topsecret'), connect)).rejects.toThrow(
      /\*{8}/
    )
    await expect(
      checkLocalMysqlConnection(createConfig({}, 'topsecret'), connect)
    ).rejects.not.toThrow(/topsecret/)
  })
})

describe('readLocalTablePrefix', () => {
  it('reads the prefix out of the local wp-config.php', async () => {
    await expect(readLocalTablePrefix(wpDir)).resolves.toBe('acme_')
  })

  it('falls back to wp_ when there is no wp-config.php', async () => {
    await expect(readLocalTablePrefix(bareDir)).resolves.toBe('wp_')
  })
})

describe('getActiveThemeFromLocalDb', () => {
  it('queries the prefixed options table of the named database', async () => {
    const { connect, recorded } = createConnector([{ option_value: 'acme-theme' }])
    await expect(getActiveThemeFromLocalDb(createConfig(), 'acme_local', connect)).resolves.toBe(
      'acme-theme'
    )
    expect(recorded.queries).toEqual([
      "SELECT option_value FROM acme_options WHERE option_name = 'template';"
    ])
    expect(recorded.options[0].database).toBe('acme_local')
    expect(recorded.ended).toBe(1)
  })

  it('decodes a Buffer column', async () => {
    const { connect } = createConnector([{ option_value: Buffer.from('binary-theme', 'utf8') }])
    await expect(getActiveThemeFromLocalDb(createConfig(), 'db', connect)).resolves.toBe(
      'binary-theme'
    )
  })

  it('fails when WordPress has no template option', async () => {
    const { connect } = createConnector([])
    await expect(getActiveThemeFromLocalDb(createConfig(), 'db', connect)).rejects.toThrow(
      /no 'acme_options' row for 'template'/
    )
  })

  it('closes the connection even when the query fails', async () => {
    const recorded: Recorded = { options: [], queries: [], ended: 0 }
    const connect: LocalMysqlConnector = async (options) => {
      recorded.options.push(options)
      return {
        query: async () => {
          throw new Error('Table acme_options does not exist')
        },
        end: async () => {
          recorded.ended += 1
        }
      }
    }
    await expect(getActiveThemeFromLocalDb(createConfig(), 'db', connect)).rejects.toThrow(
      /Table acme_options does not exist/
    )
    expect(recorded.ended).toBe(1)
  })
})
