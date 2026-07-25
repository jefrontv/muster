// Enumerating the plugins installed on each side, and diffing them.
//
// Ported from ocsites `_compare_plugins_impl` (mcp_server.py:1450-1578). WP-CLI is asked first on
// both sides because it also knows activation status; when it is absent the plugin directory is
// scanned and versions come out of the PHP headers instead.
//
// One correctness fix over the Python: it flagged a row as differing when either the version OR the
// status differed, and the directory-scan fallback reports status 'unknown'. So on any site without
// WP-CLI on one side, *every* plugin was reported as differing. Here the diff tag is decided by the
// version alone and the two statuses are carried on the row for the caller to render.

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  PluginComparisonRow,
  PluginEntry,
  PluginInventorySource
} from '../../shared/site-tool-types'
import { quoteShellArgument, type RemoteLayout, type SiteSshSession } from './pipeline-contract'
import { parsePluginHeader } from './remote-plugin-slug'
import { runLocalWpCli, runRemoteWpCli, type LocalWpEnvResolver } from './wp-cli-runner'

const WP_PLUGIN_LIST_ARGS = [
  'plugin',
  'list',
  '--format=json',
  '--skip-themes',
  '--skip-plugins'
] as const

const PLUGIN_LIST_TIMEOUT_MS = 30_000
/** Only the header block matters, and a bundled minified PHP file can be megabytes. */
const HEADER_READ_BYTES = 4096

export type PluginInventory = {
  source: PluginInventorySource
  /** Keyed by plugin directory slug, which is what WP-CLI's `name` column reports. */
  plugins: Record<string, PluginEntry>
}

/** Parses `wp plugin list --format=json`. Returns null when the payload is not that shape. */
export function parseWpPluginList(stdout: string): Record<string, PluginEntry> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout.trim() || '[]')
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) {
    return null
  }
  const plugins: Record<string, PluginEntry> = {}
  for (const row of parsed) {
    if (typeof row !== 'object' || row === null || !('name' in row)) {
      continue
    }
    const name = row.name
    if (typeof name !== 'string' || name.length === 0) {
      continue
    }
    const version = 'version' in row && typeof row.version === 'string' ? row.version : ''
    const status = 'status' in row && typeof row.status === 'string' ? row.status : 'unknown'
    plugins[name] = { name, version, status }
  }
  return plugins
}

export async function readLocalPluginInventory(
  wpDir: string,
  contentDir: string,
  dbSocket: string,
  resolveLocalWpEnv?: LocalWpEnvResolver
): Promise<PluginInventory> {
  try {
    const result = await runLocalWpCli(
      {
        cwd: wpDir,
        args: [...WP_PLUGIN_LIST_ARGS],
        allowWrites: false,
        timeoutMs: PLUGIN_LIST_TIMEOUT_MS,
        ...(dbSocket ? { dbSocket } : {})
      },
      resolveLocalWpEnv
    )
    const parsed = result.code === 0 ? parseWpPluginList(result.stdout) : null
    if (parsed && Object.keys(parsed).length > 0) {
      return { source: 'wp-cli', plugins: parsed }
    }
  } catch {
    // No WP-CLI, or it could not bootstrap the site. The directory scan below still works.
  }
  return scanLocalPluginDirectory(path.join(wpDir, contentDir, 'plugins'))
}

async function scanLocalPluginDirectory(pluginsDir: string): Promise<PluginInventory> {
  let entries: string[]
  try {
    entries = await readdir(pluginsDir)
  } catch {
    return { source: 'unavailable', plugins: {} }
  }
  const plugins: Record<string, PluginEntry> = {}
  for (const slug of entries) {
    const directory = path.join(pluginsDir, slug)
    if (!(await stat(directory).catch(() => null))?.isDirectory()) {
      continue
    }
    plugins[slug] = {
      name: slug,
      version: await readVersionFromHeaders(directory),
      status: 'unknown'
    }
  }
  return { source: 'directory-scan', plugins }
}

async function readVersionFromHeaders(pluginDir: string): Promise<string> {
  const main = `${path.basename(pluginDir)}.php`
  const entries = await readdir(pluginDir).catch((): string[] => [])
  const candidates = [
    ...(entries.includes(main) ? [main] : []),
    ...entries.filter((name) => name !== main && name.toLowerCase().endsWith('.php')).sort()
  ]
  for (const name of candidates.slice(0, 10)) {
    const contents = await readFile(path.join(pluginDir, name), 'utf8').catch(() => null)
    const version =
      contents === null ? '' : parsePluginHeader(contents.slice(0, HEADER_READ_BYTES)).version
    if (version) {
      return version
    }
  }
  return '?'
}

export async function readRemotePluginInventory(
  session: SiteSshSession,
  layout: RemoteLayout,
  environment: string
): Promise<PluginInventory> {
  const listed = await runRemoteWpCli(session, {
    rootPath: layout.webroot,
    args: [...WP_PLUGIN_LIST_ARGS],
    allowWrites: false,
    timeoutMs: PLUGIN_LIST_TIMEOUT_MS,
    environment
  })
  const parsed = listed.code === 0 ? parseWpPluginList(listed.stdout) : null
  if (parsed && Object.keys(parsed).length > 0) {
    return { source: 'wp-cli', plugins: parsed }
  }
  return scanRemotePluginDirectory(session, layout)
}

/**
 * The no-WP-CLI fallback, ported verbatim in shape: one shell loop that prints `slug|Version: x`
 * per plugin. `"$d"*.php` keeps the glob outside the quotes on purpose — the directory name is
 * quoted, the wildcard still expands.
 */
async function scanRemotePluginDirectory(
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<PluginInventory> {
  const pluginsRoot = `${layout.webroot}/${layout.contentDir}/plugins`
  const result = await session.exec(
    `for d in ${quoteShellArgument(pluginsRoot)}/*/; do ` +
      'name=$(basename "$d"); ' +
      `vline=$(grep -m1 -h '^[[:space:]]*Version:' "$d"*.php 2>/dev/null | head -1); ` +
      'echo "$name|$vline"; done',
    { timeoutMs: PLUGIN_LIST_TIMEOUT_MS }
  )
  const plugins: Record<string, PluginEntry> = {}
  for (const line of result.stdout.split('\n')) {
    const separator = line.indexOf('|')
    if (separator < 0) {
      continue
    }
    const name = line.slice(0, separator).trim()
    if (name.length === 0 || name === '*') {
      continue
    }
    const version = /Version:\s*(.+)/.exec(line.slice(separator + 1))?.[1]?.trim() ?? '?'
    plugins[name] = { name, version, status: 'unknown' }
  }
  return {
    source: Object.keys(plugins).length > 0 ? 'directory-scan' : 'unavailable',
    plugins
  }
}

/** Pure: the whole comparison is decided here, so it is testable without a site or a server. */
export function diffPluginInventories(
  local: Record<string, PluginEntry>,
  remote: Record<string, PluginEntry>
): PluginComparisonRow[] {
  const names = [...new Set([...Object.keys(local), ...Object.keys(remote)])].sort()
  return names.map((plugin) => {
    const here = local[plugin]
    const there = remote[plugin]
    if (here && !there) {
      return {
        plugin,
        diff: 'local-only',
        localVersion: here.version,
        remoteVersion: null,
        localStatus: here.status,
        remoteStatus: null
      }
    }
    if (there && !here) {
      return {
        plugin,
        diff: 'remote-only',
        localVersion: null,
        remoteVersion: there.version,
        localStatus: null,
        remoteStatus: there.status
      }
    }
    return {
      plugin,
      diff: here?.version === there?.version ? 'match' : 'version-changed',
      localVersion: here?.version ?? null,
      remoteVersion: there?.version ?? null,
      localStatus: here?.status ?? null,
      remoteStatus: there?.status ?? null
    }
  })
}
