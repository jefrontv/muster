import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalMysqlConnection, LocalMysqlConnectionOptions } from './local-mysql-connection'
import { SiteRunStepError, type RemoteLayout } from './pipeline-contract'
import {
  readLocalActiveTheme,
  readLocalWordPressVersion,
  readRemoteActiveTheme,
  readRemoteWordPressVersion,
  readWordPressVersions
} from './site-wordpress-facts'
import {
  createFakeSshSession,
  createToolConfig,
  type FakeExecHandler
} from './site-tool-test-fixtures'

const LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }
const REMOTE_DB_PASSWORD = 'remote-db-password'
const WP_CONFIG = [
  '<?php',
  "define('DB_NAME', 'acme_prod');",
  "define('DB_USER', 'acme_user');",
  `define('DB_PASSWORD', '${REMOTE_DB_PASSWORD}');`,
  "$table_prefix = 'acme_';"
].join('\n')

let wpDir: string

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-facts-'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

function writeVersionPhp(coreSubpath: string, version: string): void {
  const directory = path.join(wpDir, coreSubpath, 'wp-includes')
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, 'version.php'), `<?php\n$wp_version = '${version}';\n`)
}

describe('readLocalWordPressVersion', () => {
  it('reads a standard install', async () => {
    writeVersionPhp('', '6.5.2')
    expect(await readLocalWordPressVersion(wpDir)).toBe('6.5.2')
  })

  it('reads a Bedrock install, where core lives under wp/', async () => {
    // ocsites only looked directly under the root, so Bedrock always reported "unknown".
    writeVersionPhp('wp', '6.4.3')
    expect(await readLocalWordPressVersion(wpDir)).toBe('6.4.3')
  })

  it('returns empty rather than throwing when there is no version.php', async () => {
    expect(await readLocalWordPressVersion(wpDir)).toBe('')
  })
})

describe('readRemoteWordPressVersion', () => {
  it('probes both core locations with a single-quoted grep pattern', async () => {
    const fake = createFakeSshSession(() => ({ stdout: "$wp_version = '6.5.2';\n" }))
    expect(await readRemoteWordPressVersion(fake.session, LAYOUT)).toBe('6.5.2')
    const command = fake.commands[0]
    expect(command).toContain("'public_html/wp-includes/version.php'")
    expect(command).toContain("'public_html/wp/wp-includes/version.php'")
    // Single quotes, or the remote shell would expand $wp_version to nothing before grep saw it.
    expect(command).toContain(String.raw`'^[[:space:]]*\$wp_version'`)
  })

  it('returns empty when the server prints nothing usable', async () => {
    const fake = createFakeSshSession(() => ({ code: 1, stdout: '' }))
    expect(await readRemoteWordPressVersion(fake.session, LAYOUT)).toBe('')
  })
})

describe('readWordPressVersions', () => {
  it('flags a genuine mismatch', async () => {
    writeVersionPhp('', '6.5.2')
    const fake = createFakeSshSession(() => ({ stdout: "$wp_version = '6.4.3';\n" }))
    expect(await readWordPressVersions(createToolConfig(wpDir), fake.session, LAYOUT)).toEqual({
      environment: 'main',
      local: '6.5.2',
      remote: '6.4.3',
      mismatch: true
    })
  })

  it('does not call an unknown side a mismatch', async () => {
    const fake = createFakeSshSession(() => ({ stdout: "$wp_version = '6.4.3';\n" }))
    const versions = await readWordPressVersions(createToolConfig(wpDir), fake.session, LAYOUT)
    expect(versions).toMatchObject({ local: '', remote: '6.4.3', mismatch: false })
  })
})

describe('readRemoteActiveTheme', () => {
  it('prefers remote WP-CLI when it answers', async () => {
    const fake = createFakeSshSession((command) =>
      command.includes("'option' 'get' 'template'") ? { stdout: 'acme-theme\n' } : undefined
    )
    expect(await readRemoteActiveTheme(createToolConfig(wpDir), fake.session, LAYOUT)).toEqual({
      theme: 'acme-theme',
      source: 'remote-wp-cli',
      environment: 'main'
    })
  })

  it('ignores a chatty remote profile banner ahead of the answer', async () => {
    const fake = createFakeSshSession((command) =>
      command.includes("'option' 'get' 'template'")
        ? { stdout: 'Welcome to shared-host-42\nacme-theme\n' }
        : undefined
    )
    const theme = await readRemoteActiveTheme(createToolConfig(wpDir), fake.session, LAYOUT)
    expect(theme.theme).toBe('acme-theme')
  })

  it('falls back to a database query, using the parsed table prefix', async () => {
    const handler: FakeExecHandler = (command) => {
      if (command.includes("'option' 'get' 'template'")) {
        return { code: 127, stderr: 'wp: command not found' }
      }
      if (command.includes('cat wp-config.php')) {
        return { stdout: WP_CONFIG }
      }
      if (command.startsWith('mysql --defaults-extra-file=')) {
        return { stdout: 'db-theme\n' }
      }
      return undefined
    }
    const fake = createFakeSshSession(handler)
    expect(await readRemoteActiveTheme(createToolConfig(wpDir), fake.session, LAYOUT)).toEqual({
      theme: 'db-theme',
      source: 'remote-database',
      environment: 'main'
    })
    const query = fake.commands.find((command) => command.startsWith('mysql '))
    expect(query).toContain('acme_options')
    // The DB password goes into a 0600 option file, never onto a command line.
    expect(query).not.toContain(REMOTE_DB_PASSWORD)
    expect(fake.secureFiles[0].contents).toContain(REMOTE_DB_PASSWORD)
    expect(fake.removed).toEqual([fake.secureFiles[0].path])
  })

  it('reports a step error when neither path can answer', async () => {
    const fake = createFakeSshSession((command) =>
      command.includes('cat wp-config.php') ? { stdout: WP_CONFIG } : { code: 1, stdout: '' }
    )
    await expect(
      readRemoteActiveTheme(createToolConfig(wpDir), fake.session, LAYOUT)
    ).rejects.toThrow(SiteRunStepError)
  })
})

describe('readLocalActiveTheme', () => {
  function fakeConnector(rows: unknown) {
    const queries: string[] = []
    const options: LocalMysqlConnectionOptions[] = []
    const connect = async (given: LocalMysqlConnectionOptions): Promise<LocalMysqlConnection> => {
      options.push(given)
      return {
        query: async (sql: string) => {
          queries.push(sql)
          return rows
        },
        end: async () => undefined
      }
    }
    return { connect, queries, options }
  }

  it('queries the local database with the wp-config table prefix', async () => {
    writeFileSync(
      path.join(wpDir, 'wp-config.php'),
      `<?php\ndefine('DB_NAME', 'acme_local');\n$table_prefix = 'zz_';\n`
    )
    const connector = fakeConnector([{ option_value: 'local-theme' }])
    expect(await readLocalActiveTheme(createToolConfig(wpDir), connector.connect)).toEqual({
      theme: 'local-theme',
      source: 'local-database',
      environment: null
    })
    expect(connector.queries[0]).toContain('zz_options')
    expect(connector.options[0].database).toBe('acme_local')
  })

  it('refuses when the local wp-config has no DB_NAME to query', async () => {
    writeFileSync(path.join(wpDir, 'wp-config.php'), '<?php\n// nothing\n')
    await expect(
      readLocalActiveTheme(createToolConfig(wpDir), fakeConnector([]).connect)
    ).rejects.toThrow(/DB_NAME is missing/)
  })

  it('does not open a connection when there is no wp-config at all', async () => {
    const connector = fakeConnector([])
    await expect(readLocalActiveTheme(createToolConfig(wpDir), connector.connect)).rejects.toThrow(
      SiteRunStepError
    )
    expect(connector.options).toEqual([])
  })
})

// Guards against a future refactor quietly reintroducing a shell-expanded grep pattern.
it('never emits an unquoted $wp_version to the remote shell', async () => {
  const fake = createFakeSshSession(() => ({ stdout: '' }))
  await readRemoteWordPressVersion(fake.session, LAYOUT)
  expect(vi.isMockFunction(fake.session.exec)).toBe(false)
  expect(fake.commands[0]).not.toMatch(/[^'\\]\$wp_version/)
})
