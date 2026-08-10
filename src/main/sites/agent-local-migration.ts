// Turning an existing checkout into an agent-local site.
//
// LocalWP's equivalent (localwp-migration.ts) has to do real work: create a site over Local's
// GraphQL API, relocate the checkout into app/public, rewrite wp-config.php, then import the old
// database over the new socket. agent-local does all of that behind one call, serving the site in
// place at its own docroot and keeping a wp-config.php.agent-local.bak, so this module is mostly
// about reporting the plan honestly and mapping the response onto Muster's site record.

import { existsSync } from 'node:fs'
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
 * The one thing it must refuse is a folder with no WordPress in it. agent-local reads the database
 * out of the docroot's wp-config.php, so a checkout that is only a theme or plugin repo — no core,
 * no wp-load.php — fails inside the daemon partway through. The preview is the gate the renderer
 * relies on to turn that into a message before anything runs, so it has to look at the same folder
 * the run will hand over.
 */
export function planAgentLocalMigration(
  request: LocalWpMigrationRequest,
  sourcePath?: string
): LocalWpMigrationPlan {
  const source = sourcePath?.trim() || request.sitePath
  const hasWordPress = existsSync(path.join(source, 'wp-load.php'))
  return {
    ok: hasWordPress,
    blockedReason: hasWordPress
      ? ''
      : `No WordPress in ${source} — wp-load.php is missing. agent-local serves an install that already exists, so pull the site down from the server first, or point the WordPress subpath at the folder that holds wp-load.php.`,
    mode: 'migrate',
    sitePath: request.sitePath,
    domain: request.domain,
    wordPressRoot: source,
    databaseName: '',
    databaseUser: '',
    appPublicEntries: [],
    moves: [],
    edits: [path.join(source, 'wp-config.php')],
    steps: [
      `Register ${source} with agent-local as '${request.domain}'`,
      'Point wp-config.php at agent-local’s MariaDB (a .agent-local.bak copy is kept)',
      'Start the site and issue its HTTPS certificate'
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
  // Refuse what the plan already refused, rather than letting the daemon discover it mid-import:
  // the renderer previews before every run, but a caller that skips the preview must not get a
  // half-registered site out of it.
  if (!plan.ok) {
    return failed(plan.blockedReason)
  }
  const source = options.sourcePath?.trim() || request.sitePath
  report(`Registering ${source} with agent-local…`)
  const response = await requestWithDaemon(
    host,
    'POST',
    '/import',
    {
      source,
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
