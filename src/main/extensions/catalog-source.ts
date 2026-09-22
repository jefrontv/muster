// Where the Extension Hub's catalog comes from, in strict order of trust: a validated remote copy,
// the last validated copy we cached, then the copy shipped in this build.
//
// The bundled copy is the floor, not the fallback of last resort in name only — it is what makes
// the hub work on a fresh install, behind a captive portal, and on a plane. Nothing here is allowed
// to throw or to block startup: a catalog that cannot be fetched is a hub that is a few days stale,
// never a hub that is broken.
//
// Bytes off the network are parsed by the shared schema before anything else sees them, and a
// catalog that fails validation is discarded in favour of what we already had. A remote file can
// therefore go missing, go corrupt, or go hostile without changing what Muster is willing to do.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  parseExtensionCatalog,
  type ExtensionCatalog
} from '../../shared/extension-catalog-types'

export const EXTENSION_CATALOG_URL =
  'https://github.com/jefrontv/muster/releases/latest/download/extension-catalog.json'

export const EXTENSION_CATALOG_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5_000
/** A catalog is a small text file. Anything larger is not one, and is not worth reading. */
const MAX_CATALOG_BYTES = 512 * 1024

export type ExtensionCatalogOrigin = 'remote' | 'cache' | 'bundled'

export type LoadedExtensionCatalog = {
  catalog: ExtensionCatalog
  origin: ExtensionCatalogOrigin
  /** When the bytes behind `catalog` were obtained. Null for the bundled copy. */
  fetchedAt: number | null
  /** Set when a remote refresh was attempted and failed. The catalog is still usable. */
  error?: string
}

type CachedCatalog = { fetchedAt: number; catalog: unknown }

/** Everything that touches disk, the clock or the network, so tests can aim all three elsewhere. */
export type ExtensionCatalogEnv = {
  bundledPath: string
  cachePath: string
  url: string
  now: () => number
  fetch: typeof globalThis.fetch
}

export function createDefaultExtensionCatalogEnv(): ExtensionCatalogEnv {
  // Lazy require keeps this module importable in tests with no Electron app instance.
  const { app } = require('electron') as { app: Electron.App }
  const resourceRoot = app.isPackaged ? process.resourcesPath : resolve(process.cwd(), 'resources')
  return {
    bundledPath: join(resourceRoot, 'extensions', 'extension-catalog.json'),
    cachePath: join(app.getPath('userData'), 'extension-catalog.json'),
    url: EXTENSION_CATALOG_URL,
    now: () => Date.now(),
    fetch: globalThis.fetch
  }
}

async function readCatalogFile(path: string): Promise<ExtensionCatalog | null> {
  try {
    return parseExtensionCatalog(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return null
  }
}

async function readCache(path: string): Promise<{ fetchedAt: number; catalog: ExtensionCatalog } | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as CachedCatalog
    const catalog = parseExtensionCatalog(parsed?.catalog)
    if (!catalog || typeof parsed.fetchedAt !== 'number') {
      return null
    }
    return { fetchedAt: parsed.fetchedAt, catalog }
  } catch {
    return null
  }
}

async function writeCache(path: string, entry: CachedCatalog): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(entry), 'utf8')
  } catch {
    // A cache that cannot be written costs one extra fetch next launch. It is not worth an error.
  }
}

async function fetchRemoteCatalog(env: ExtensionCatalogEnv): Promise<ExtensionCatalog> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await env.fetch(env.url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`Catalog request failed with ${response.status}.`)
    }
    const text = await response.text()
    if (text.length > MAX_CATALOG_BYTES) {
      throw new Error('Catalog response was larger than a catalog can be.')
    }
    const catalog = parseExtensionCatalog(JSON.parse(text))
    if (!catalog) {
      throw new Error('Catalog did not match the expected schema.')
    }
    return catalog
  } finally {
    clearTimeout(timer)
  }
}

async function loadFloor(env: ExtensionCatalogEnv): Promise<LoadedExtensionCatalog> {
  const bundled = await readCatalogFile(env.bundledPath)
  if (bundled) {
    return { catalog: bundled, origin: 'bundled', fetchedAt: null }
  }
  // Why an empty catalog rather than a throw: a build missing its resource should show an empty
  // hub, not crash the pane that would have told the user something is wrong.
  return {
    catalog: { schemaVersion: 1, updatedAt: '1970-01-01', entries: [] },
    origin: 'bundled',
    fetchedAt: null
  }
}

/**
 * `force` skips the TTL, not the fallbacks: a manual refresh that fails still answers with the best
 * catalog on hand rather than emptying the pane the user is looking at.
 */
export async function loadExtensionCatalog(
  options: { force?: boolean } = {},
  env: ExtensionCatalogEnv = createDefaultExtensionCatalogEnv()
): Promise<LoadedExtensionCatalog> {
  const cached = await readCache(env.cachePath)
  if (!options.force && cached && env.now() - cached.fetchedAt < EXTENSION_CATALOG_TTL_MS) {
    return { catalog: cached.catalog, origin: 'cache', fetchedAt: cached.fetchedAt }
  }

  try {
    const catalog = await fetchRemoteCatalog(env)
    const fetchedAt = env.now()
    await writeCache(env.cachePath, { fetchedAt, catalog })
    return { catalog, origin: 'remote', fetchedAt }
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause)
    if (cached) {
      return { catalog: cached.catalog, origin: 'cache', fetchedAt: cached.fetchedAt, error }
    }
    return { ...(await loadFloor(env)), error }
  }
}
