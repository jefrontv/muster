// Reading WordPress configuration: wp-config.php defines, the table prefix, and the remote
// database credentials sitting behind them.
//
// Ported from ocsites deploy/utils.py:8-70, deploy/backup.py:138, deploy/database.py:51-141.
// Remote paths here are always POSIX and are built with `/` on purpose — path.join would emit
// backslashes when Muster itself runs on Windows.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderMysqlOptionFile } from './mysql-binary'
import { quoteShellArgument, SiteRunStepError, type SiteSshSession } from './pipeline-contract'

export const DEFAULT_TABLE_PREFIX = 'wp_'

const ACTIVE_THEME_STEP = 'active-theme'
const REMOTE_THEME_OPTION_FILENAME = '.muster-theme.cnf'

/** The minimum a mysql/mysqldump invocation needs. Widened so callers may pass extra fields. */
export type MysqlCredentials = {
  name: string
  user: string
  password: string
  prefix?: string
}

export type RemoteDbCredentials = MysqlCredentials & {
  host: string
  prefix: string
}

export type WpConfigSanitizeResult = {
  contents: string
  /** Constants whose duplicate defines were commented out. */
  deduplicated: string[]
}

/** Python's str.splitlines(): a trailing newline does not produce a final empty line. */
function splitLines(contents: string): string[] {
  const lines = contents.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

/**
 * Value of the first *active* `define('NAME', 'value')`.
 *
 * Skips `/* *\/` blocks and `//` / `#` line comments and returns the FIRST match, because PHP
 * keeps the first define and warns on the rest. A naive whole-file regex taking the last match
 * picked commented-out stale values — typically a backup DB name, imported over the live one.
 */
export function readWpConfigDefine(contents: string, name: string): string | null {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const pattern = new RegExp(
    `define\\s*\\(\\s*['"]${escapedName}['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)`
  )
  for (const raw of splitLines(contents.replaceAll(/\/\*[\s\S]*?\*\//g, ''))) {
    const line = raw.trimStart()
    if (line.startsWith('//') || line.startsWith('#')) {
      continue
    }
    const match = pattern.exec(line)
    if (match) {
      return match[1]
    }
  }
  return null
}

export function parseWpTablePrefix(contents: string): string | null {
  return /\$table_prefix\s*=\s*['"](\w+)['"]/.exec(contents)?.[1] ?? null
}

/** The prefix is interpolated straight into SQL, so anything but `\w+` is refused, not escaped. */
export function normalizeTablePrefix(value: string | null | undefined): string {
  return value && /^\w+$/.test(value) ? value : DEFAULT_TABLE_PREFIX
}

/** Null when absent or unreadable — a site without wp-config.php is a normal state here. */
export async function readWpConfigFile(wpDir: string): Promise<string | null> {
  try {
    return await readFile(join(wpDir, 'wp-config.php'), 'utf8')
  } catch {
    return null
  }
}

/** Empty string when there is no local wp-config.php to override the remote DB name. */
export async function readLocalWpConfigDbName(wpDir: string): Promise<string> {
  const contents = await readWpConfigFile(wpDir)
  return contents === null ? '' : (readWpConfigDefine(contents, 'DB_NAME') ?? '')
}

/**
 * Comment out DUPLICATE active `define('NAME', ...)` lines, keeping the first of each.
 *
 * PHP warns "already defined" on the later ones, and that warning is enough to abort WP-CLI
 * mid `search-replace`. Redundant defines are annotated rather than deleted, and lines that were
 * already commented out (alternate DB_NAME toggles, say) are left exactly as they are.
 */
export function sanitizeWpConfig(contents: string): WpConfigSanitizeResult {
  const definePattern = /^define\s*\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/
  const seen = new Set<string>()
  const deduplicated: string[] = []
  const output: string[] = []
  let inBlockComment = false
  for (const line of splitLines(contents)) {
    const stripped = line.trimStart()
    if (inBlockComment) {
      output.push(line)
      inBlockComment = !line.includes('*/')
      continue
    }
    if (stripped.startsWith('/*') && !line.includes('*/')) {
      inBlockComment = true
      output.push(line)
      continue
    }
    if (stripped.startsWith('//') || stripped.startsWith('#') || stripped.startsWith('*')) {
      output.push(line)
      continue
    }
    const name = definePattern.exec(stripped)?.[1]
    if (name !== undefined && seen.has(name)) {
      output.push(`// [muster] duplicate define removed: ${stripped}`)
      deduplicated.push(name)
      continue
    }
    if (name !== undefined) {
      seen.add(name)
    }
    output.push(line)
  }
  return {
    contents: output.join('\n') + (contents.endsWith('\n') ? '\n' : ''),
    deduplicated
  }
}

const ENV_DB_KEYS: Record<string, true> = {
  DB_NAME: true,
  DB_USER: true,
  DB_PASSWORD: true,
  DB_HOST: true,
  DB_PREFIX: true
}

/** Bedrock keeps DB credentials in `.env`; splits on the first `=` so values may contain one. */
export function parseEnvDatabaseCredentials(text: string): Record<string, string> {
  const credentials: Record<string, string> = {}
  for (const raw of splitLines(text)) {
    const line = raw.trim()
    const separator = line.indexOf('=')
    if (line.startsWith('#') || separator < 0) {
      continue
    }
    const key = line.slice(0, separator).trim()
    if (!ENV_DB_KEYS[key]) {
      continue
    }
    const value = line.slice(separator + 1).trim()
    const quoted =
      value.length >= 2 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0])
    credentials[key] = quoted ? value.slice(1, -1) : value
  }
  return credentials
}

/**
 * Bedrock's wp-config.php is a thin loader with no DB defines. Check `.env` at the configured
 * root and at its parent, because that root may be the project root or its `web/` docroot.
 */
async function readBedrockEnvCredentials(
  session: SiteSshSession,
  rootPath: string
): Promise<Record<string, string> | null> {
  for (const envPath of [`${rootPath}/.env`, `${rootPath}/../.env`]) {
    const result = await session.exec(`cat ${quoteShellArgument(envPath)} 2>/dev/null`)
    const parsed = parseEnvDatabaseCredentials(result.stdout)
    if (parsed.DB_NAME) {
      return parsed
    }
  }
  return null
}

/** Extract DB credentials and table prefix from a remote WordPress install. */
export async function readRemoteDbCredentials(
  session: SiteSshSession,
  rootPath: string
): Promise<RemoteDbCredentials> {
  const result = await session.exec(`cd ${quoteShellArgument(rootPath)} && cat wp-config.php`)
  const contents = result.stdout.trim()
  const credentials: RemoteDbCredentials = {
    name: readWpConfigDefine(contents, 'DB_NAME') ?? '',
    user: readWpConfigDefine(contents, 'DB_USER') ?? '',
    password: readWpConfigDefine(contents, 'DB_PASSWORD') ?? '',
    host: readWpConfigDefine(contents, 'DB_HOST') ?? '',
    prefix: normalizeTablePrefix(parseWpTablePrefix(contents))
  }
  if (credentials.name.length > 0) {
    return credentials
  }
  const env = await readBedrockEnvCredentials(session, rootPath)
  if (env === null) {
    return credentials
  }
  return {
    name: env.DB_NAME,
    user: env.DB_USER || credentials.user,
    password: env.DB_PASSWORD || credentials.password,
    host: env.DB_HOST || credentials.host,
    prefix: normalizeTablePrefix(env.DB_PREFIX ?? credentials.prefix)
  }
}

/**
 * Active theme slug from the remote database. Grouped with the credential read because it is the
 * same wp-config-derived access, and it is the one remote query the deploy pipeline needs before
 * it knows which theme directory to build and upload.
 */
export async function getActiveThemeViaSsh(
  session: SiteSshSession,
  credentials: MysqlCredentials,
  rootPath: string
): Promise<string> {
  if (credentials.name.length === 0) {
    throw new SiteRunStepError(
      ACTIVE_THEME_STEP,
      'Cannot look up the active theme: DB_NAME is missing from wp-config.php.'
    )
  }
  const prefix = normalizeTablePrefix(credentials.prefix)
  const sql = `SELECT option_value FROM ${prefix}options WHERE option_name = 'template';`
  const optionFilePath = `${rootPath}/${REMOTE_THEME_OPTION_FILENAME}`
  await session.writeSecureRemoteFile(
    optionFilePath,
    renderMysqlOptionFile({ user: credentials.user, password: credentials.password })
  )
  let stdout = ''
  let stderr = ''
  try {
    const result = await session.exec(
      `mysql --defaults-extra-file=${quoteShellArgument(optionFilePath)} ` +
        `--database=${quoteShellArgument(credentials.name)} --batch --skip-column-names ` +
        `-e ${quoteShellArgument(sql)}`
    )
    stdout = result.stdout.trim()
    stderr = result.stderr.trim()
  } finally {
    await session.removeRemoteFile(optionFilePath)
  }
  if (stdout.length === 0) {
    throw new SiteRunStepError(
      ACTIVE_THEME_STEP,
      `Could not determine the active theme from remote database '${credentials.name}'${
        stderr.length > 0 ? `: ${stderr}` : ' — empty result'
      }`
    )
  }
  return stdout
}
