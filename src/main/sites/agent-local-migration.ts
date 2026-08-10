// Turning an existing checkout into an agent-local site.
//
// LocalWP's equivalent (localwp-migration.ts) has to do real work: create a site over Local's
// GraphQL API, relocate the checkout into app/public, rewrite wp-config.php, then import the old
// database over the new socket. agent-local does all of that behind one call, serving the site in
// place at its own docroot and keeping a wp-config.php.agent-local.bak, so this module is mostly
// about reporting the plan honestly and mapping the response onto Muster's site record.

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { LocalWpMigrationPlan, LocalWpMigrationResult } from '../../shared/site-stack-types'
import type { LocalWpMigrationRequest } from './localwp-migration-plan'
import {
  AGENT_LOCAL_START_TIMEOUT_MS,
  AGENT_LOCAL_UNSUPPORTED_PLATFORM,
  createAgentLocalHost,
  describeAgentLocalResponse,
  isAgentLocalSupported,
  requestWithDaemon,
  type AgentLocalHost
} from './agent-local-host'

export type AgentLocalMigrationOptions = {
  host?: AgentLocalHost
  onStatus?: (message: string) => void
  /** Defaults to the site's current PHP; agent-local picks its own when this is empty. */
  phpVersion?: string
  /**
   * The docroot to register, when WordPress is not at the site path itself.
   *
   * agent-local resolves the database from the docroot's wp-config.php, so handing it a repo root
   * whose WordPress lives in `wp/` or `app/public/` fails with "missing wp-load.php". Muster
   * already records that offset as `localWpRoot`; the caller resolves it and passes the result.
   */
  sourcePath?: string
}

export type AgentLocalMigrationOutcome = LocalWpMigrationResult & {
  /** agent-local's docroot, relative to the site path. '' when the checkout IS the docroot. */
  localWpRoot: string
  domain: string
  dbPort: number | null
  dbUser: string
  phpVersion: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value : ''
}

/**
 * agent-local serves in place, so there is nothing to move and nothing to delete. Saying so
 * explicitly matters: the renderer's confirmation step exists to warn about LocalWP deleting an
 * existing app/public, and showing that warning for a migration that cannot delete anything would
 * train the user to click through it.
 *
 * Two shapes, decided by whether WordPress is on disk yet, mirroring what the daemon itself
 * accepts. A checkout that already has core is adopted with its database (`POST /import`). A bare
 * theme or plugin repo is attached instead (`POST /attach`): the folder is served as-is against an
 * empty database, ready for the server import to fill. `POST /sites` is not the answer for either —
 * it refuses a non-empty directory outright.
 */
export function planAgentLocalMigration(
  request: LocalWpMigrationRequest,
  sourcePath?: string
): LocalWpMigrationPlan {
  const source = sourcePath?.trim() || request.sitePath
  const hasWordPress = existsSync(path.join(source, 'wp-load.php'))
  return {
    ok: true,
    blockedReason: '',
    // `create` is the wizard's word for "there is no WordPress here yet", which is exactly the
    // attach case — the copy and the button both key off it.
    mode: hasWordPress ? 'migrate' : 'create',
    sitePath: request.sitePath,
    domain: request.domain,
    wordPressRoot: source,
    databaseName: '',
    databaseUser: '',
    appPublicEntries: [],
    moves: [],
    edits: hasWordPress ? [path.join(source, 'wp-config.php')] : [],
    steps: hasWordPress
      ? [
          `Register ${source} with agent-local as '${request.domain}'`,
          'Point wp-config.php at agent-local’s MariaDB (a .agent-local.bak copy is kept)',
          'Start the site and issue its HTTPS certificate'
        ]
      : [
          `Serve ${source} as '${request.domain}' with an empty database`,
          'Start the site and issue its HTTPS certificate',
          'Pull the site down with the import step to fill it'
        ]
  }
}

/**
 * One POST does the whole migration. There is no progress stream, so the caller's status lines are
 * emitted around the blocking call rather than forwarded from it.
 */
export async function runAgentLocalMigration(
  request: LocalWpMigrationRequest,
  options: AgentLocalMigrationOptions = {}
): Promise<AgentLocalMigrationOutcome> {
  const host = options.host ?? createAgentLocalHost()
  const plan = planAgentLocalMigration(request, options.sourcePath)
  const log: string[] = []
  const report = (message: string): void => {
    log.push(message)
    options.onStatus?.(message)
  }
  const failed = (message: string): AgentLocalMigrationOutcome => ({
    ok: false,
    message,
    plan,
    socketPath: '',
    localWpRoot: '',
    databaseImported: false,
    log: [...log, message],
    domain: request.domain,
    dbPort: null,
    dbUser: '',
    phpVersion: ''
  })

  if (!isAgentLocalSupported(host)) {
    return failed(AGENT_LOCAL_UNSUPPORTED_PLATFORM)
  }
  const source = options.sourcePath?.trim() || request.sitePath
  // `/import` copies a database out of the docroot's wp-config.php, which a bare repo has not got.
  // `/attach` is the daemon's own answer for that: serve the folder against a fresh empty database
  // and let the server import fill it. Picking the wrong one fails inside the daemon partway.
  const attaching = plan.mode === 'create'
  report(
    attaching
      ? `Serving ${source} with agent-local…`
      : `Registering ${source} with agent-local…`
  )
  const response = await requestWithDaemon(
    host,
    'POST',
    attaching ? '/attach' : '/import',
    {
      ...(attaching ? { dir: source } : { source }),
      name: request.siteName,
      domain: request.domain,
      ...(options.phpVersion ? { php_version: options.phpVersion } : {})
    },
    { timeoutMs: AGENT_LOCAL_START_TIMEOUT_MS }
  )
  if (!response.ok) {
    return failed(describeAgentLocalResponse(response))
  }
  const data = asRecord(response.data)
  const wpDir = readString(data, 'wp_dir')
  const db = asRecord(data?.db)
  report(`agent-local is serving ${request.domain}.`)
  return {
    ok: true,
    message: `Site registered with agent-local as '${readString(data, 'slug') || request.siteName}'.`,
    plan,
    // Always TCP — see agent-local-site-control.ts on why this must stay empty.
    socketPath: '',
    localWpRoot: relativeDocroot(request.sitePath, wpDir),
    // agent-local imports the site's existing database itself, reading wp-config.php in the docroot.
    databaseImported: true,
    log,
    domain: readString(data, 'domain') || request.domain,
    dbPort: typeof db?.port === 'number' ? db.port : null,
    dbUser: readString(db, 'user'),
    phpVersion: readString(data, 'php_version')
  }
}

/**
 * Muster stores the docroot as an offset from the site path. Read it from what agent-local reports
 * rather than assuming a layout: sites imported from LocalWP keep `app/public`, sites agent-local
 * created use `wp`, and a bare checkout has no offset at all.
 */
/**
 * Which folder agent-local should actually serve.
 *
 * Muster's stored `localWpRoot` is LocalWP's convention (`app/public`) and outlives the stack that
 * created it. A site that used to be on LocalWP, was deleted, and re-cloned as a bare repo keeps
 * that subpath while the files sit at the repo root — handing it over attaches an empty directory
 * and every later step runs against nothing. So the recorded subpath is honoured only when it
 * holds WordPress or at least some files; otherwise the checkout itself is the site.
 */
export function resolveAgentLocalDocroot(sitePath: string, storedSubPath: string): string {
  const subPath = storedSubPath.replace(/^[/\\]+|[/\\]+$/g, '')
  if (subPath.length === 0) {
    return sitePath
  }
  const candidate = path.join(sitePath, subPath)
  if (existsSync(path.join(candidate, 'wp-load.php'))) {
    return candidate
  }
  // WordPress at the root wins over an empty subfolder that only looks like a docroot.
  if (existsSync(path.join(sitePath, 'wp-load.php'))) {
    return sitePath
  }
  return hasAnyFiles(candidate) ? candidate : sitePath
}

function hasAnyFiles(directory: string): boolean {
  try {
    // `.htaccess` alone is what an interrupted import leaves behind; it is not a site.
    return readdirSync(directory).some((entry) => entry !== '.htaccess' && entry !== '.DS_Store')
  } catch {
    return false
  }
}

export function relativeDocroot(sitePath: string, wpDir: string): string {
  if (wpDir.length === 0) {
    return ''
  }
  const relative = path.relative(sitePath, wpDir)
  // Outside the site path (or absolute) means Muster's record and agent-local's disagree; keeping
  // the stored offset is safer than writing a '..' path the file tree would follow out of the repo.
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return ''
  }
  return relative
}
