// Turning "acf" into the directory the server actually calls it.
//
// Ported from ocsites `_plugin_slug_candidates` / `_resolve_remote_plugin_slug` /
// `_read_plugin_header` (mcp_server.py:2052-2257). Plugin directory names rarely match what anyone
// types — ACF Pro ships as `advanced-custom-fields-pro` — so the resolution runs three passes over
// the server's real directory listing: exact, punctuation-insensitive, then all-tokens-present.
// An ambiguous result is an error, never a guess: replacing the wrong plugin directory is
// destructive.

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  quoteShellArgument,
  SiteRunStepError,
  type RemoteLayout,
  type SiteSshSession
} from './pipeline-contract'

export const PLUGIN_SYNC_STEP = 'plugin-sync'

const PLUGIN_SLUG = /^[A-Za-z0-9._-]+$/
const MAX_REMOTE_PLUGINS = 300
const MAX_HEADER_FILES = 30
const MAX_HEADER_LINES = 220
const DEFAULT_LIST_TIMEOUT_MS = 60_000

/** ocsites' alias table: the names people type versus the directories vendors ship. */
const PLUGIN_ALIASES: Record<string, readonly string[]> = {
  acf: ['advanced-custom-fields-pro', 'advanced-custom-fields', 'acf'],
  'acf-pro': ['advanced-custom-fields-pro', 'acf-pro'],
  acfpro: ['advanced-custom-fields-pro']
}

export type PluginSlugRequest = {
  /** What the caller typed, with any `wp-content/plugins/` prefix stripped. */
  requested: string
  /** Aliases first, then the normalised slug itself. */
  candidates: string[]
}

export function pluginSlugCandidates(plugin: string): PluginSlugRequest {
  let requested = plugin.trim().replaceAll(/^\/+|\/+$/g, '')
  if (requested.length === 0) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      "A plugin is required, e.g. 'acf' or 'advanced-custom-fields-pro'."
    )
  }
  for (const prefix of ['wp-content/plugins/', 'app/plugins/', 'plugins/']) {
    if (requested.startsWith(prefix)) {
      requested = requested.slice(prefix.length).replaceAll(/^\/+|\/+$/g, '')
      break
    }
  }
  if (requested.includes('/')) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      `A plugin must be a top-level slug, not a nested path: ${plugin}`
    )
  }
  const slug = requested.toLowerCase().replaceAll(/\s+/g, '-')
  if (!PLUGIN_SLUG.test(slug)) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      'A plugin slug may contain only letters, numbers, dots, underscores and hyphens.'
    )
  }
  const candidates = [...(PLUGIN_ALIASES[slug] ?? [])]
  if (!candidates.includes(slug)) {
    candidates.push(slug)
  }
  return { requested, candidates }
}

export type RemotePluginMatch = {
  slug: string
  /** Relative to the resolved webroot, ready to hand to the remote fetch. */
  remotePath: string
  matchedBy: 'exact' | 'compact' | 'fuzzy'
}

/** Every plugin directory on the server, newest listing each call — plugins get installed. */
export async function listRemotePluginSlugs(
  session: SiteSshSession,
  layout: RemoteLayout,
  timeoutMs = DEFAULT_LIST_TIMEOUT_MS
): Promise<string[]> {
  const pluginsRoot = `${layout.webroot}/${layout.contentDir}/plugins`
  const probe = await session.exec(`test -d ${quoteShellArgument(pluginsRoot)}`, {
    timeoutMs: 15_000
  })
  if (probe.code !== 0) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      `The remote plugins directory does not exist: ${pluginsRoot}`
    )
  }
  // `-print` and basename locally, rather than ocsites' `-exec basename {} \;` — that forked a
  // process per plugin, which on a 120-plugin site is 120 round trips of pure overhead.
  const listed = await session.exec(
    `find ${quoteShellArgument(pluginsRoot)} -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort | head -n ${MAX_REMOTE_PLUGINS}`,
    { timeoutMs }
  )
  const slugs = listed.stdout
    .split('\n')
    .map((line) => line.trim().split('/').at(-1) ?? '')
    .filter((slug) => slug.length > 0 && PLUGIN_SLUG.test(slug))
  if (slugs.length === 0 && listed.code !== 0) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      listed.stderr.trim() || `Listing remote plugins failed (exit ${listed.code}).`
    )
  }
  return slugs
}

export async function resolveRemotePluginSlug(
  session: SiteSshSession,
  layout: RemoteLayout,
  plugin: string,
  timeoutMs = DEFAULT_LIST_TIMEOUT_MS
): Promise<RemotePluginMatch> {
  const { requested, candidates } = pluginSlugCandidates(plugin)
  const available = await listRemotePluginSlugs(session, layout, timeoutMs)
  const relativeTo = (slug: string): string => `${layout.contentDir}/plugins/${slug}`

  const byLower = new Map(available.map((slug) => [slug.toLowerCase(), slug]))
  for (const candidate of candidates) {
    const exact = byLower.get(candidate.toLowerCase())
    if (exact) {
      return { slug: exact, remotePath: relativeTo(exact), matchedBy: 'exact' }
    }
  }

  const compacts = new Set(candidates.map(compactSlug))
  const compactMatches = available.filter((slug) => compacts.has(compactSlug(slug)))
  if (compactMatches.length === 1) {
    const slug = compactMatches[0]
    return { slug, remotePath: relativeTo(slug), matchedBy: 'compact' }
  }

  const tokens =
    candidates
      .at(-1)
      ?.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean) ?? []
  const fuzzyMatches =
    tokens.length === 0
      ? []
      : available.filter((slug) => tokens.every((token) => slug.toLowerCase().includes(token)))
  if (fuzzyMatches.length === 1) {
    const slug = fuzzyMatches[0]
    return { slug, remotePath: relativeTo(slug), matchedBy: 'fuzzy' }
  }
  if (compactMatches.length > 1 || fuzzyMatches.length > 1) {
    const matches = [...new Set([...compactMatches, ...fuzzyMatches])].sort()
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      `Several remote plugins match "${requested}" — pass an exact slug: ${matches.slice(0, 20).join(', ')}`
    )
  }
  throw new SiteRunStepError(
    PLUGIN_SYNC_STEP,
    `No remote plugin matches "${requested}" under ${layout.contentDir}/plugins. ` +
      `Installed: ${available.slice(0, 30).join(', ') || 'none'}`
  )
}

function compactSlug(slug: string): string {
  return slug.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
}

export type PluginHeader = {
  name: string
  version: string
  /** Which PHP file the header was read from; useful when a plugin's main file is unconventional. */
  file: string
}

/**
 * Reads `Plugin Name:` / `Version:` out of a plugin's PHP header. The conventional main file
 * (`<slug>/<slug>.php`) is tried first, then every other top-level `.php` file, because plenty of
 * plugins name their entry point something else entirely.
 */
export async function readLocalPluginHeader(pluginDir: string): Promise<PluginHeader | null> {
  const directory = await stat(pluginDir).catch(() => null)
  if (!directory?.isDirectory()) {
    return null
  }
  const main = `${path.basename(pluginDir)}.php`
  const entries = await readdir(pluginDir).catch((): string[] => [])
  const phpFiles = [
    ...(entries.includes(main) ? [main] : []),
    ...entries.filter((name) => name !== main && name.toLowerCase().endsWith('.php')).sort()
  ]
  for (const name of phpFiles.slice(0, MAX_HEADER_FILES)) {
    const full = path.join(pluginDir, name)
    const contents = await readFile(full, 'utf8').catch(() => null)
    if (contents === null) {
      continue
    }
    const header = parsePluginHeader(contents)
    if (header.name || header.version) {
      return { ...header, file: full }
    }
  }
  return null
}

/** Exported for the plugin inventory, which parses the same header shape off a remote grep. */
export function parsePluginHeader(contents: string): { name: string; version: string } {
  let name = ''
  let version = ''
  for (const raw of contents.split('\n').slice(0, MAX_HEADER_LINES)) {
    const cleaned = raw
      .trim()
      .replace(/^[/*#@\s]+/, '')
      .trim()
    const separator = cleaned.indexOf(':')
    if (separator < 0) {
      continue
    }
    const key = cleaned.slice(0, separator).trim().toLowerCase()
    const value = cleaned.slice(separator + 1).trim()
    if (value.length === 0) {
      continue
    }
    if (key === 'plugin name') {
      name ||= value
    } else if (key === 'version') {
      version ||= value
    }
  }
  return { name, version }
}
