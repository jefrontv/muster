// The WP-CLI search-replace step, ported from ocsites deploy/backup.py::_handle_wp_search_replace.
//
// Three things happen before the command runs, in ocsites' order: wp-config.php is pointed at the
// local database, package.json's dev domain is corrected, and only then are the live↔local domains
// rewritten across every table. Doing the config first matters — WP-CLI bootstraps the site's
// wp-config, so a config still pointing at the production database would rewrite the wrong rows.

import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import { createLocalWpHost } from './localwp-host'
import { buildLocalWpWpEnv } from './localwp-wp-cli-environment'
import {
  SiteRunCancelledError,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError
} from './pipeline-contract'

const STEP = 'wp-search-replace'
const WP_BINARY = 'wp'

/** Resolves LocalWP's PHP/socket environment; injected so tests need no Local.app. */
export type LocalWpEnvironmentResolver = (
  socketPath: string
) => Promise<Record<string, string> | null>

const resolveLocalWpEnvironmentDefault: LocalWpEnvironmentResolver = (socketPath) =>
  buildLocalWpWpEnv(createLocalWpHost(), socketPath)

export type WpSearchReplaceOptions = {
  resolveLocalWpEnvironment?: LocalWpEnvironmentResolver
}

export async function runWpSearchReplace(
  context: SiteRunContext,
  config: SiteRunConfig,
  options: WpSearchReplaceOptions = {}
): Promise<void> {
  const localDomain = config.site.localDomain
  const liveDomain = config.environment.liveDomain
  if (!localDomain || !liveDomain) {
    context.status('Skipping WP Search and Replace: Local or Live domain not specified')
    return
  }

  context.status('Running WP Search and Replace…')
  await writeLocalWpConfig(context, config)
  await updatePackageJsonDevDomain(context, config)

  context.throwIfCancelled()
  const abspath = await resolveWpCliPath(config.wpDir)
  if (!(await hasWordPressCore(abspath))) {
    // Same degrade as a missing `wp` binary: the database is already imported, only the domain
    // rewrite is missing. Hard-failing here loses that work over a checkout with no core in it —
    // which is every theme/plugin repo imported without "Pull server files".
    context.log(
      `⚠ Skipping WP Search and Replace: no WordPress core in ${abspath}. Enable "Pull server files" (or run \`wp core download\`) and re-run the import to rewrite domains.`
    )
    return
  }
  const environment = await resolveWpEnvironment(
    context,
    config,
    options.resolveLocalWpEnvironment ?? resolveLocalWpEnvironmentDefault
  )
  const timeoutSeconds = config.site.searchReplaceTimeoutSeconds
  const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0

  context.status('Running WP-CLI search-replace (may take several minutes)…')
  const args = [
    'search-replace',
    liveDomain,
    localDomain,
    '--all-tables',
    '--precise',
    '--report-changed-only',
    // guid must never be rewritten (it is a permanent identifier, not a URL) and rewriting
    // user_email would corrupt accounts at a matching domain.
    '--skip-columns=guid',
    '--skip-columns=user_email',
    `--path=${abspath}`
  ]
  const result = await runWpCli(context, config, args, environment, timeoutMs)
  if (result === null) {
    return
  }
  if (result.timedOut) {
    throw new SiteRunStepError(
      STEP,
      `WP Search and Replace exceeded its ${timeoutSeconds}s timeout. Raise or disable the search-replace timeout for this site and try again.`
    )
  }
  reportSearchReplaceResult(context, result.code, result.stdout, result.stderr)
}

/** Null when WP-CLI could not be run at all — logged as a degrade, not an import failure. */
async function runWpCli(
  context: SiteRunContext,
  config: SiteRunConfig,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<StreamCommandResult | null> {
  try {
    return await streamCommand(WP_BINARY, args, {
      cwd: config.wpDir,
      env,
      signal: context.signal,
      timeoutMs
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SiteRunCancelledError()
    }
    // Degrade rather than fail the whole import: the database is already in place, only the
    // domain rewrite is missing, and the user can finish it by hand.
    const detail = error instanceof Error ? error.message : String(error)
    context.log(
      `⚠ Skipping WP Search and Replace: WP-CLI (\`wp\`) could not be run — install WP-CLI and re-run the import, or run it manually in ${config.wpDir}. (${detail})`
    )
    return null
  }
}

function reportSearchReplaceResult(
  context: SiteRunContext,
  code: number,
  stdout: string,
  stderr: string
): void {
  if (code === 0) {
    // WP-CLI's per-table table wraps into an unreadable mess in the log view; the Success: line
    // carries the only number anyone reads.
    const summary = stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith('success'))
    context.log(summary ? `WP Search and Replace: ${summary}` : 'WP Search and Replace completed')
    return
  }

  const errorLines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  // A messy-but-valid wp-config (e.g. DISALLOW_FILE_EDIT defined twice) makes PHP emit warnings
  // on stderr with a nonzero exit even though the rewrite ran. Only a real error aborts.
  const onlyWarnings =
    errorLines.length > 0 &&
    errorLines.every(
      (line) => /warning|notice|deprecated/i.test(line) && !/\b(?:fatal|error)\b/i.test(line)
    )
  if (onlyWarnings) {
    context.log('WP Search and Replace completed (ignored PHP warnings from wp-config).')
    return
  }
  throw new SiteRunStepError(
    STEP,
    `WP Search and Replace failed: ${errorLines.join(' ') || `wp exited ${code}`}`
  )
}

/**
 * ABSPATH for WP-CLI's `--path`. Standard installs keep core at wpDir; Bedrock keeps it at
 * wpDir/wp with wp-config.php one level up, which WP-CLI still finds by walking upwards.
 */
async function resolveWpCliPath(wpDir: string): Promise<string> {
  try {
    await stat(path.join(wpDir, 'wp', 'wp-load.php'))
    return path.join(wpDir, 'wp')
  } catch {
    return wpDir
  }
}

/** wp-load.php is what WP-CLI itself looks for when it reports "not a WordPress installation". */
async function hasWordPressCore(abspath: string): Promise<boolean> {
  try {
    await stat(path.join(abspath, 'wp-load.php'))
    return true
  } catch {
    return false
  }
}

async function resolveWpEnvironment(
  context: SiteRunContext,
  config: SiteRunConfig,
  resolveLocalWpEnvironment: LocalWpEnvironmentResolver
): Promise<NodeJS.ProcessEnv> {
  let localWpEnvironment: Record<string, string> | null = null
  if (config.site.dbSocket) {
    // The system `wp` runs system PHP, which knows nothing about Local's per-site MySQL socket.
    localWpEnvironment = await resolveLocalWpEnvironment(config.site.dbSocket)
    context.log(
      localWpEnvironment
        ? 'Using LocalWP PHP environment for WP-CLI…'
        : 'LocalWP env not found — falling back to system WP-CLI…'
    )
  }
  return {
    ...(localWpEnvironment ?? process.env),
    // WP-CLI bootstraps the site's wp-config; a benign PHP warning on stderr would otherwise
    // abort an otherwise-fine search-replace. Real errors still surface.
    WP_CLI_PHP_ARGS: '-d error_reporting=E_ERROR -d display_errors=0'
  }
}

/** Escapes for a PHP single-quoted string, then substitutes the whole `define(...)` call. */
function replaceWpDefine(contents: string, name: string, value: string): string {
  const pattern = new RegExp(`define\\s*\\(\\s*['"]${name}['"]\\s*,\\s*['"][^'"]*['"]\\s*\\)`, 'g')
  const escaped = value.replaceAll('\\', String.raw`\\`).replaceAll("'", String.raw`\'`)
  // A function replacement so a password containing `$&` or `$1` is not treated as a backreference.
  return contents.replaceAll(pattern, () => `define('${name}', '${escaped}')`)
}

/**
 * Points the imported wp-config.php at the local database. Absent wp-config.php is a no-op, as in
 * ocsites — a partial import may not have one yet.
 */
/**
 * The DB_HOST a local WordPress must use, per stack.
 *
 * - Socket stacks (LocalWP): literally `localhost`. PHP's mysqli only reaches a Unix socket for that
 *   exact hostname; `127.0.0.1` forces TCP, which a LocalWP per-site daemon is not listening on.
 * - TCP on the default port (MAMP, DBngin): bare `127.0.0.1`.
 * - TCP on any other port (agent-local: 10360): `127.0.0.1:<port>`. Without the suffix WordPress
 *   dials 3306 and the site dies with "Error establishing a database connection" the moment the
 *   import finishes — the connection Muster itself makes is fine, because it passes the port
 *   separately, which is exactly what hides this.
 */
export function localWpConfigDbHost(config: SiteRunConfig): string {
  if (config.site.dbSocket) {
    return 'localhost'
  }
  const port = config.site.dbPort
  return port && port !== MYSQL_DEFAULT_PORT ? `127.0.0.1:${port}` : '127.0.0.1'
}

const MYSQL_DEFAULT_PORT = 3306

async function writeLocalWpConfig(context: SiteRunContext, config: SiteRunConfig): Promise<void> {
  const wpConfigPath = path.join(config.wpDir, 'wp-config.php')
  let contents: string
  try {
    contents = await readFile(wpConfigPath, 'utf8')
  } catch {
    return
  }

  const localDbHost = localWpConfigDbHost(config)
  const updates = [`DB_HOST to ${localDbHost}`]
  let next = replaceWpDefine(contents, 'DB_HOST', localDbHost)
  if (config.site.dbUser) {
    next = replaceWpDefine(next, 'DB_USER', config.site.dbUser)
    updates.push(`DB_USER to ${config.site.dbUser}`)
  }
  if (config.localDatabaseName) {
    // The stack owns the schema name (agent-local: al_<slug>); an imported wp-config.php still
    // carries the source site's, which the per-site user has no rights on.
    next = replaceWpDefine(next, 'DB_NAME', config.localDatabaseName)
    updates.push(`DB_NAME to ${config.localDatabaseName}`)
  }
  if (config.dbPassword) {
    next = replaceWpDefine(next, 'DB_PASSWORD', config.dbPassword)
    // Never the value: this line reaches the run log and the console.
    updates.push('DB_PASSWORD')
  }
  if (config.site.localDomain) {
    // An efront-theme constant; sites without it are unaffected because nothing matches.
    const localUrl = `http://${config.site.localDomain}`
    next = replaceWpDefine(next, 'EFRONT_URL_OVERRIDE', localUrl)
    updates.push(`EFRONT_URL_OVERRIDE to ${localUrl}`)
  }

  await writeFile(wpConfigPath, next, 'utf8')
  context.log(`Updated wp-config.php: ${updates.join(', ')}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Repoints the theme's browsersync/dev-server domain. Only rewrites an existing `config.dev`. */
async function updatePackageJsonDevDomain(
  context: SiteRunContext,
  config: SiteRunConfig
): Promise<void> {
  if (!config.site.localDomain) {
    return
  }
  const packageJsonPath = path.join(config.wpDir, 'package.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown
  } catch {
    return
  }
  if (!isRecord(parsed) || !isRecord(parsed.config) || typeof parsed.config.dev !== 'string') {
    return
  }
  parsed.config.dev = config.site.localDomain
  try {
    await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8')
    context.log(`Updated package.json config.dev to ${config.site.localDomain}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    context.log(`⚠ Error updating package.json: ${detail}`)
  }
}
