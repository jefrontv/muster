// Two facts an operator wants before touching a site: which WordPress it runs, and which theme is
// live. Ported from ocsites `get_wordpress_version` / `_read_local_wp_version` /
// `_read_remote_wp_version` (mcp_server.py:1407-1448, :3512) and `get_active_theme` /
// `get_remote_active_theme` (:3188, :3230).
//
// Both readings probe the Bedrock location as well as the standard one. ocsites looked only at
// `wp-includes/version.php` directly under the root, so a Bedrock site always reported "unknown".

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SiteActiveTheme, SiteWordPressVersions } from '../../shared/site-tool-types'
import { getActiveThemeFromLocalDb, type LocalMysqlConnector } from './local-mysql-connection'
import {
  quoteShellArgument,
  SiteRunStepError,
  type RemoteLayout,
  type SiteRunConfig,
  type SiteSshSession
} from './pipeline-contract'
import {
  getActiveThemeViaSsh,
  readLocalWpConfigDbName,
  readRemoteDbCredentials
} from './wp-config-reader'
import { runRemoteWpCli } from './wp-cli-runner'

export const WORDPRESS_FACTS_STEP = 'wordpress-facts'

const PROBE_TIMEOUT_MS = 15_000
const WP_VERSION_DEFINE = /\$wp_version\s*=\s*['"]([^'"]+)['"]/
/** Core sits under `wp/` in Bedrock and at the root in a standard install. */
const CORE_SUBPATHS = ['', 'wp'] as const

/** Empty string when no readable version.php exists — an absent reading is not a failure. */
export async function readLocalWordPressVersion(wpDir: string): Promise<string> {
  for (const core of CORE_SUBPATHS) {
    const file = path.join(wpDir, core, 'wp-includes', 'version.php')
    const contents = await readFile(file, 'utf8').catch(() => null)
    const version = contents === null ? null : WP_VERSION_DEFINE.exec(contents)?.[1]
    if (version) {
      return version
    }
  }
  return ''
}

export async function readRemoteWordPressVersion(
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<string> {
  const files = CORE_SUBPATHS.map((core) =>
    quoteShellArgument([layout.webroot, core, 'wp-includes/version.php'].filter(Boolean).join('/'))
  ).join(' ')
  // The pattern is single-quoted, so `$wp_version` reaches grep instead of the remote shell.
  const result = await session.exec(
    `grep -h -m1 -E ${quoteShellArgument(String.raw`^[[:space:]]*\$wp_version`)} ${files} 2>/dev/null | head -1`,
    { timeoutMs: PROBE_TIMEOUT_MS }
  )
  return WP_VERSION_DEFINE.exec(result.stdout)?.[1] ?? ''
}

export async function readWordPressVersions(
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<SiteWordPressVersions> {
  const [local, remote] = await Promise.all([
    readLocalWordPressVersion(config.wpDir),
    readRemoteWordPressVersion(session, layout)
  ])
  return {
    environment: config.environmentName,
    local,
    remote,
    // An unknown side is not a mismatch: reporting one would send people chasing a phantom.
    mismatch: local.length > 0 && remote.length > 0 && local !== remote
  }
}

export async function readLocalActiveTheme(
  config: SiteRunConfig,
  connect?: LocalMysqlConnector
): Promise<SiteActiveTheme> {
  const dbName = await readLocalWpConfigDbName(config.wpDir)
  if (dbName.length === 0) {
    throw new SiteRunStepError(
      WORDPRESS_FACTS_STEP,
      `DB_NAME is missing from the local wp-config.php at ${config.wpDir}.`
    )
  }
  return {
    theme: await getActiveThemeFromLocalDb(config, dbName, connect),
    source: 'local-database',
    environment: null
  }
}

/**
 * WP-CLI first, a direct database query second — ocsites' order, and the right one: plenty of
 * shared hosts have no `wp` on PATH, but every WordPress install has a database.
 */
export async function readRemoteActiveTheme(
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<SiteActiveTheme> {
  const viaCli = await runRemoteWpCli(session, {
    rootPath: layout.webroot,
    args: ['option', 'get', 'template', '--skip-themes', '--skip-plugins'],
    allowWrites: false,
    timeoutMs: PROBE_TIMEOUT_MS,
    environment: config.environmentName
  })
  const fromCli = viaCli.stdout.trim().split('\n').at(-1)?.trim() ?? ''
  if (viaCli.code === 0 && fromCli.length > 0) {
    return { theme: fromCli, source: 'remote-wp-cli', environment: config.environmentName }
  }
  const credentials = await readRemoteDbCredentials(session, layout.webroot)
  return {
    theme: await getActiveThemeViaSsh(session, credentials, layout.webroot),
    source: 'remote-database',
    environment: config.environmentName
  }
}
