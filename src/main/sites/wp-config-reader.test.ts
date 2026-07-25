import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SiteRunStepError, type SiteExecResult, type SiteSshSession } from './pipeline-contract'
import {
  getActiveThemeViaSsh,
  normalizeTablePrefix,
  parseEnvDatabaseCredentials,
  parseWpTablePrefix,
  readLocalWpConfigDbName,
  readRemoteDbCredentials,
  readWpConfigDefine,
  sanitizeWpConfig
} from './wp-config-reader'

type FakeSession = {
  session: SiteSshSession
  commands: string[]
  written: { path: string; contents: string }[]
  removed: string[]
}

function createFakeSession(respond: (command: string) => Partial<SiteExecResult>): FakeSession {
  const fake: FakeSession = {
    commands: [],
    written: [],
    removed: [],
    session: {
      exec: async (command) => {
        fake.commands.push(command)
        return { code: 0, stdout: '', stderr: '', ...respond(command) }
      },
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async (path, contents) => {
        fake.written.push({ path, contents })
      },
      removeRemoteFile: async (path) => {
        fake.removed.push(path)
      },
      close: async () => undefined
    }
  }
  return fake
}

describe('readWpConfigDefine', () => {
  it('reads a single-quoted define', () => {
    expect(readWpConfigDefine("define('DB_NAME', 'acme_live');", 'DB_NAME')).toBe('acme_live')
  })

  it('reads a double-quoted define', () => {
    expect(readWpConfigDefine('define("DB_USER", "wp_user");', 'DB_USER')).toBe('wp_user')
  })

  it('tolerates the whitespace real wp-config files carry', () => {
    expect(readWpConfigDefine("define ( 'DB_PASSWORD' ,  'p@ss' ) ;", 'DB_PASSWORD')).toBe('p@ss')
  })

  it('returns an empty define rather than treating it as absent', () => {
    expect(readWpConfigDefine("define('DB_PASSWORD', '');", 'DB_PASSWORD')).toBe('')
  })

  it('keeps the FIRST active define, because PHP does', () => {
    const contents = ["define('DB_NAME', 'live');", "define('DB_NAME', 'staging');"].join('\n')
    expect(readWpConfigDefine(contents, 'DB_NAME')).toBe('live')
  })

  it('skips // and # commented defines', () => {
    const contents = [
      "// define('DB_NAME', 'old_backup');",
      "  # define('DB_NAME', 'older_backup');",
      "define('DB_NAME', 'live');"
    ].join('\n')
    expect(readWpConfigDefine(contents, 'DB_NAME')).toBe('live')
  })

  it('skips defines inside a block comment', () => {
    const contents = ['/*', "define('DB_NAME', 'stale');", '*/', "define('DB_NAME', 'live');"].join(
      '\n'
    )
    expect(readWpConfigDefine(contents, 'DB_NAME')).toBe('live')
  })

  it('skips a single-line block comment', () => {
    const contents = ["/* define('DB_NAME', 'stale'); */ define('DB_NAME', 'live');"].join('\n')
    expect(readWpConfigDefine(contents, 'DB_NAME')).toBe('live')
  })

  it('returns null when the constant is not defined', () => {
    expect(readWpConfigDefine("define('DB_USER', 'root');", 'DB_NAME')).toBeNull()
  })

  it('returns null when every define is commented out', () => {
    expect(readWpConfigDefine("// define('DB_NAME', 'old');", 'DB_NAME')).toBeNull()
  })

  it('does not match a different constant with the same prefix', () => {
    expect(readWpConfigDefine("define('DB_NAME_BACKUP', 'other');", 'DB_NAME')).toBeNull()
  })

  it('survives CRLF line endings', () => {
    expect(readWpConfigDefine("<?php\r\ndefine('DB_NAME', 'live');\r\n", 'DB_NAME')).toBe('live')
  })
})

describe('parseWpTablePrefix', () => {
  it('reads a single-quoted prefix', () => {
    expect(parseWpTablePrefix("$table_prefix = 'acme_';")).toBe('acme_')
  })

  it('reads a double-quoted prefix', () => {
    expect(parseWpTablePrefix('$table_prefix="wp_5x_";')).toBe('wp_5x_')
  })

  it('returns null when absent', () => {
    expect(parseWpTablePrefix('<?php // nothing here')).toBeNull()
  })
})

describe('normalizeTablePrefix', () => {
  it('keeps a word-character prefix', () => {
    expect(normalizeTablePrefix('acme_1')).toBe('acme_1')
  })

  it('falls back to wp_ when missing', () => {
    expect(normalizeTablePrefix(null)).toBe('wp_')
    expect(normalizeTablePrefix('')).toBe('wp_')
  })

  it('refuses a prefix that would break out of the SQL identifier', () => {
    expect(normalizeTablePrefix('wp_; DROP TABLE users; --')).toBe('wp_')
    expect(normalizeTablePrefix('wp`_')).toBe('wp_')
  })
})

describe('sanitizeWpConfig', () => {
  it('keeps the first define and comments out the duplicate', () => {
    const result = sanitizeWpConfig(
      ["define('DB_NAME', 'live');", "define('DB_NAME', 'staging');"].join('\n')
    )
    expect(result.deduplicated).toEqual(['DB_NAME'])
    expect(result.contents).toBe(
      [
        "define('DB_NAME', 'live');",
        "// [muster] duplicate define removed: define('DB_NAME', 'staging');"
      ].join('\n')
    )
  })

  it('leaves already-commented toggles untouched', () => {
    const contents = ["// define('DB_NAME', 'toggle');", "define('DB_NAME', 'live');"].join('\n')
    const result = sanitizeWpConfig(contents)
    expect(result.deduplicated).toEqual([])
    expect(result.contents).toBe(contents)
  })

  it('does not treat defines inside a block comment as seen', () => {
    const contents = [
      '/*',
      " define('DB_NAME', 'documented');",
      '*/',
      "define('DB_NAME', 'live');"
    ].join('\n')
    const result = sanitizeWpConfig(contents)
    expect(result.deduplicated).toEqual([])
    expect(result.contents).toBe(contents)
  })

  it('preserves a trailing newline without inventing a blank line', () => {
    expect(sanitizeWpConfig("define('A', '1');\n").contents).toBe("define('A', '1');\n")
  })

  it('preserves the absence of a trailing newline', () => {
    expect(sanitizeWpConfig("define('A', '1');").contents).toBe("define('A', '1');")
  })

  it('reports every deduplicated constant', () => {
    const result = sanitizeWpConfig(
      [
        "define('WP_DEBUG', true);",
        "define('DB_NAME', 'a');",
        "define('DB_NAME', 'b');",
        "define('DB_USER', 'u');",
        "define('DB_USER', 'v');"
      ].join('\n')
    )
    expect(result.deduplicated).toEqual(['DB_NAME', 'DB_USER'])
  })
})

describe('parseEnvDatabaseCredentials', () => {
  it('strips surrounding quotes and ignores comments', () => {
    const parsed = parseEnvDatabaseCredentials(
      ['# comment', "DB_NAME='bedrock'", 'DB_USER="root"', 'WP_ENV=production'].join('\n')
    )
    expect(parsed).toEqual({ DB_NAME: 'bedrock', DB_USER: 'root' })
  })

  it('splits on the first = so a value may contain one', () => {
    expect(parseEnvDatabaseCredentials('DB_PASSWORD=a=b=c').DB_PASSWORD).toBe('a=b=c')
  })

  it('ignores lines without an assignment', () => {
    expect(parseEnvDatabaseCredentials('DB_NAME\n\n')).toEqual({})
  })
})

describe('readRemoteDbCredentials', () => {
  const wpConfig = [
    "define('DB_NAME', 'acme_live');",
    "define('DB_USER', 'acme_user');",
    "define('DB_PASSWORD', 'acme_pass');",
    "define('DB_HOST', 'localhost');",
    "$table_prefix = 'acme_';"
  ].join('\n')

  it('reads the four defines plus the table prefix', async () => {
    const fake = createFakeSession(() => ({ stdout: wpConfig }))
    await expect(readRemoteDbCredentials(fake.session, 'public_html')).resolves.toEqual({
      name: 'acme_live',
      user: 'acme_user',
      password: 'acme_pass',
      host: 'localhost',
      prefix: 'acme_'
    })
    expect(fake.commands[0]).toBe("cd 'public_html' && cat wp-config.php")
  })

  it('quotes a root path containing a single quote', async () => {
    const fake = createFakeSession(() => ({ stdout: wpConfig }))
    await readRemoteDbCredentials(fake.session, "it's/html")
    expect(fake.commands[0]).toBe("cd 'it'\\''s/html' && cat wp-config.php")
  })

  it('defaults the prefix to wp_ when wp-config does not set it', async () => {
    const fake = createFakeSession(() => ({ stdout: "define('DB_NAME', 'x');" }))
    const credentials = await readRemoteDbCredentials(fake.session, 'public_html')
    expect(credentials.prefix).toBe('wp_')
  })

  it('falls back to the Bedrock .env when wp-config has no DB_NAME', async () => {
    const env = ["DB_NAME='bedrock_db'", "DB_USER='bedrock_user'", "DB_PREFIX='bd_'"].join('\n')
    const fake = createFakeSession((command) =>
      command.includes('.env') ? { stdout: env } : { stdout: '<?php // thin loader' }
    )
    const credentials = await readRemoteDbCredentials(fake.session, 'site')
    expect(credentials).toEqual({
      name: 'bedrock_db',
      user: 'bedrock_user',
      password: '',
      host: '',
      prefix: 'bd_'
    })
  })

  it('checks the parent directory when the configured root is the web/ docroot', async () => {
    const fake = createFakeSession((command) =>
      command.includes('site/../.env') ? { stdout: "DB_NAME='parent_db'" } : { stdout: '' }
    )
    const credentials = await readRemoteDbCredentials(fake.session, 'site')
    expect(credentials.name).toBe('parent_db')
    expect(fake.commands).toContain("cat 'site/.env' 2>/dev/null")
    expect(fake.commands).toContain("cat 'site/../.env' 2>/dev/null")
  })

  it('returns empty credentials when neither source has a DB name', async () => {
    const fake = createFakeSession(() => ({ stdout: '' }))
    const credentials = await readRemoteDbCredentials(fake.session, 'site')
    expect(credentials.name).toBe('')
  })
})

describe('getActiveThemeViaSsh', () => {
  const credentials = { name: 'acme_live', user: 'u', password: 'p', prefix: 'acme_' }

  it('queries through a 0600 option file and cleans it up', async () => {
    const fake = createFakeSession(() => ({ stdout: 'acme-theme\n' }))
    await expect(getActiveThemeViaSsh(fake.session, credentials, 'public_html')).resolves.toBe(
      'acme-theme'
    )
    expect(fake.written).toEqual([
      { path: 'public_html/.muster-theme.cnf', contents: '[client]\nuser="u"\npassword="p"\n' }
    ])
    expect(fake.commands[0]).toContain("--defaults-extra-file='public_html/.muster-theme.cnf'")
    expect(fake.commands[0]).toContain(
      "-e 'SELECT option_value FROM acme_options WHERE option_name = '\\''template'\\'';'"
    )
    expect(fake.removed).toEqual(['public_html/.muster-theme.cnf'])
  })

  it('never puts the password in the command — the remote process table is shared', async () => {
    const fake = createFakeSession(() => ({ stdout: 'acme-theme' }))
    const secret = 'hunter2-correct-horse'
    await getActiveThemeViaSsh(fake.session, { ...credentials, password: secret }, 'public_html')
    expect(fake.commands.join('\n')).not.toContain(secret)
    expect(fake.written[0].contents).toContain(secret)
  })

  it('defaults the prefix when the credentials carry none', async () => {
    const fake = createFakeSession(() => ({ stdout: 'twentytwentyfour' }))
    await getActiveThemeViaSsh(fake.session, { name: 'db', user: 'u', password: '' }, 'root')
    expect(fake.commands[0]).toContain('FROM wp_options')
  })

  it('reports the remote error when the query returns nothing', async () => {
    const fake = createFakeSession(() => ({ stdout: '', stderr: 'ERROR 1045 access denied' }))
    await expect(getActiveThemeViaSsh(fake.session, credentials, 'public_html')).rejects.toThrow(
      /ERROR 1045 access denied/
    )
    expect(fake.removed).toEqual(['public_html/.muster-theme.cnf'])
  })

  it('says the result was empty when there is no stderr either', async () => {
    const fake = createFakeSession(() => ({ stdout: '' }))
    await expect(getActiveThemeViaSsh(fake.session, credentials, 'x')).rejects.toThrow(
      /empty result/
    )
  })

  it('refuses to run without a database name', async () => {
    const fake = createFakeSession(() => ({ stdout: '' }))
    await expect(
      getActiveThemeViaSsh(fake.session, { name: '', user: 'u', password: 'p' }, 'x')
    ).rejects.toBeInstanceOf(SiteRunStepError)
    expect(fake.written).toEqual([])
  })
})

describe('readLocalWpConfigDbName', () => {
  let wpDir = ''

  beforeAll(() => {
    wpDir = mkdtempSync(join(tmpdir(), 'muster-wp-config-'))
    writeFileSync(join(wpDir, 'wp-config.php'), "<?php\ndefine('DB_NAME', 'local_acme');\n")
  })

  afterAll(() => {
    rmSync(wpDir, { recursive: true, force: true })
  })

  it('reads DB_NAME from the local wp-config.php', async () => {
    await expect(readLocalWpConfigDbName(wpDir)).resolves.toBe('local_acme')
  })

  it('returns an empty string when there is no wp-config.php', async () => {
    await expect(readLocalWpConfigDbName(join(wpDir, 'missing'))).resolves.toBe('')
  })
})
