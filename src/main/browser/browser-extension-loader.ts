// Loads user-configured unpacked Chrome extensions into the in-app browser sessions.
//
// Electron only supports UNPACKED extensions (no .crx / Web Store install) on PERSISTENT
// sessions, and does not remember them across runs — so every browser partition re-loads the
// configured directories on each boot. Electron also implements a subset of the Chrome
// extension APIs: content scripts, chrome.storage and chrome.runtime messaging work, while
// MV3 background service workers, chrome.tabs, webRequest blocking and declarativeNetRequest
// are limited or absent. Load warnings for unsupported APIs are logged by Chromium itself.

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Session } from 'electron'
import type { BrowserExtensionStatus } from '../../shared/browser-extension-types'

type ExtensionManifest = {
  name?: unknown
  version?: unknown
  manifest_version?: unknown
  action?: { default_popup?: unknown }
  browser_action?: { default_popup?: unknown }
  options_page?: unknown
  options_ui?: { page?: unknown }
}

export type ManifestReadResult =
  | { ok: true; name: string; version: string; settingsPage: string | null }
  | { ok: false; error: string }

/**
 * The page an extension expects users to configure it on. Muster has no extension toolbar, so
 * this is surfaced as an openable tab — otherwise popup-configured extensions cannot be set up.
 */
function resolveSettingsPage(manifest: ExtensionManifest): string | null {
  const candidates = [
    manifest.action?.default_popup,
    manifest.browser_action?.default_popup,
    manifest.options_ui?.page,
    manifest.options_page
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().replace(/^\.?\//, '')
    }
  }
  return null
}

export function readExtensionManifest(extensionPath: string): ManifestReadResult {
  if (!path.isAbsolute(extensionPath)) {
    return { ok: false, error: 'Extension path must be absolute.' }
  }
  if (!existsSync(extensionPath) || !statSync(extensionPath).isDirectory()) {
    return { ok: false, error: 'Folder not found. Unpacked extensions load from a directory.' }
  }
  const manifestPath = path.join(extensionPath, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return { ok: false, error: 'No manifest.json in this folder.' }
  }
  let parsed: ExtensionManifest
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest
  } catch {
    return { ok: false, error: 'manifest.json is not valid JSON.' }
  }
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null
  const version =
    typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : null
  if (!name || !version) {
    return { ok: false, error: 'manifest.json is missing "name" or "version".' }
  }
  return { ok: true, name, version, settingsPage: resolveSettingsPage(parsed) }
}

/** Drops blanks and duplicates so one folder never loads twice into the same session. */
export function normalizeExtensionPaths(paths: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of paths ?? []) {
    if (typeof raw !== 'string') {
      continue
    }
    const trimmed = raw.trim().replace(/[/\\]+$/, '')
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

type ExtensionCapableSession = Pick<Session, 'extensions'>

function hasExtensionsApi(sess: ExtensionCapableSession): boolean {
  return typeof sess.extensions?.loadExtension === 'function'
}

export async function loadBrowserExtensionsIntoSession(
  sess: ExtensionCapableSession,
  extensionPaths: readonly string[]
): Promise<BrowserExtensionStatus[]> {
  const normalized = normalizeExtensionPaths(extensionPaths)
  if (normalized.length === 0) {
    return []
  }
  if (!hasExtensionsApi(sess)) {
    return normalized.map((extensionPath) => ({
      path: extensionPath,
      id: null,
      name: null,
      version: null,
      settingsPage: null,
      error: 'This Electron build does not expose the extensions API.'
    }))
  }

  const alreadyLoaded = new Map<string, string>()
  try {
    for (const loaded of sess.extensions.getAllExtensions()) {
      alreadyLoaded.set(loaded.path.replace(/[/\\]+$/, ''), loaded.id)
    }
  } catch {
    // Best effort: an unreadable list just means we may re-load, which Electron tolerates.
  }

  const statuses: BrowserExtensionStatus[] = []
  for (const extensionPath of normalized) {
    const manifest = readExtensionManifest(extensionPath)
    if (!manifest.ok) {
      statuses.push({
        path: extensionPath,
        id: null,
        name: null,
        version: null,
        settingsPage: null,
        error: manifest.error
      })
      continue
    }
    const existingId = alreadyLoaded.get(extensionPath)
    if (existingId) {
      statuses.push({
        path: extensionPath,
        id: existingId,
        name: manifest.name,
        version: manifest.version,
        settingsPage: manifest.settingsPage,
        error: null
      })
      continue
    }
    try {
      // allowFileAccess stays off: content scripts on file:// would let an extension read local
      // files, and nothing in the in-app browser needs it.
      const loaded = await sess.extensions.loadExtension(extensionPath)
      statuses.push({
        path: extensionPath,
        id: loaded.id,
        name: loaded.name ?? manifest.name,
        version: manifest.version,
        settingsPage: manifest.settingsPage,
        error: null
      })
    } catch (error) {
      statuses.push({
        path: extensionPath,
        id: null,
        name: manifest.name,
        version: manifest.version,
        settingsPage: manifest.settingsPage,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return statuses
}

export function unloadBrowserExtensionFromSession(
  sess: ExtensionCapableSession,
  extensionPath: string
): boolean {
  if (!hasExtensionsApi(sess)) {
    return false
  }
  const target = extensionPath.trim().replace(/[/\\]+$/, '')
  try {
    const match = sess.extensions
      .getAllExtensions()
      .find((loaded) => loaded.path.replace(/[/\\]+$/, '') === target)
    if (!match) {
      return false
    }
    sess.extensions.removeExtension(match.id)
    return true
  } catch {
    return false
  }
}
