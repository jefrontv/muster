// Bridges persisted settings to the per-partition extension loader.
//
// Settings arrive through a registered provider rather than an imported Store singleton: the
// session registry configures partitions before (and in unit tests, without) a Store existing.

import * as electron from 'electron'
import type { Session } from 'electron'
import type {
  BrowserExtensionAddResult,
  BrowserExtensionStatus
} from '../../shared/browser-extension-types'
import {
  loadBrowserExtensionsIntoSession,
  normalizeExtensionPaths,
  unloadBrowserExtensionFromSession
} from './browser-extension-loader'

type SettingsBridge = {
  getPaths: () => string[]
  setPaths: (paths: string[]) => void
  /** Partitions to (re)apply changes to; supplied by the session registry. */
  listPartitions: () => string[]
}

let settingsBridge: SettingsBridge | null = null
const configuredPartitions = new Set<string>()
let latestStatuses: BrowserExtensionStatus[] = []

export function registerBrowserExtensionSettingsBridge(bridge: SettingsBridge): void {
  settingsBridge = bridge
}

/** Exposed so bundled-extension orchestration can read the active paths without a second bridge. */
export function getBrowserExtensionSettings(): SettingsBridge | null {
  return settingsBridge
}

export function resetBrowserExtensionStateForTest(): void {
  settingsBridge = null
  configuredPartitions.clear()
  latestStatuses = []
}

export function getBrowserExtensionStatuses(): BrowserExtensionStatus[] {
  return latestStatuses
}

export async function loadConfiguredBrowserExtensions(
  sess: Session,
  partition?: string,
  options: { force?: boolean } = {}
): Promise<BrowserExtensionStatus[]> {
  const paths = settingsBridge?.getPaths() ?? []
  if (paths.length === 0) {
    // Why: removing the last extension must clear the reported list too, or the UI and CLI keep
    // showing an extension that is no longer configured.
    latestStatuses = []
    return []
  }
  if (options.force) {
    // Why: Chromium reads an extension's files once at load time, so edited files (a regenerated
    // config.js) only take effect after the extension is unloaded and loaded again.
    for (const extensionPath of paths) {
      unloadBrowserExtensionFromSession(sess, extensionPath)
    }
  }
  const statuses = await loadBrowserExtensionsIntoSession(sess, paths)
  if (partition) {
    configuredPartitions.add(partition)
  }
  // Why: the UI shows one list, and every partition loads the same folders, so the newest
  // result set is representative — errors surface identically across partitions.
  latestStatuses = statuses
  return statuses
}

/** Re-applies the configured folders to every partition already set up this run. */
export async function reloadBrowserExtensionsEverywhere(
  partitions: readonly string[],
  options: { force?: boolean } = {}
): Promise<BrowserExtensionStatus[]> {
  let statuses: BrowserExtensionStatus[] = []
  for (const partition of new Set(partitions)) {
    try {
      statuses = await loadConfiguredBrowserExtensions(
        electron.session.fromPartition(partition),
        partition,
        options
      )
    } catch {
      // A partition that cannot be resolved yet simply loads when it is next configured.
    }
  }
  return statuses
}

export function unloadBrowserExtensionEverywhere(
  partitions: readonly string[],
  extensionPath: string
): void {
  for (const partition of new Set(partitions)) {
    try {
      unloadBrowserExtensionFromSession(electron.session.fromPartition(partition), extensionPath)
    } catch {
      // Best effort: an unloadable partition drops the extension on next boot regardless.
    }
  }
  latestStatuses = latestStatuses.filter((status) => status.path !== extensionPath)
}

export async function addBrowserExtensionPath(
  extensionPath: string,
  name: string,
  version: string
): Promise<BrowserExtensionAddResult> {
  if (!settingsBridge) {
    return { ok: false, reason: 'invalid', message: 'Settings are not ready yet.' }
  }
  const existing = normalizeExtensionPaths(settingsBridge.getPaths())
  const [normalized] = normalizeExtensionPaths([extensionPath])
  if (!normalized) {
    return { ok: false, reason: 'invalid', message: 'Extension path is empty.' }
  }
  if (existing.includes(normalized)) {
    return { ok: false, reason: 'duplicate', message: 'That folder is already added.' }
  }

  settingsBridge.setPaths([...existing, normalized])
  const statuses = await reloadBrowserExtensionsEverywhere(settingsBridge.listPartitions())
  const status = statuses.find((entry) => entry.path === normalized) ?? {
    path: normalized,
    id: null,
    name,
    version,
    settingsPage: null,
    error: null
  }
  return { ok: true, status }
}

export async function removeBrowserExtensionPath(
  extensionPath: string
): Promise<BrowserExtensionStatus[]> {
  if (!settingsBridge) {
    return latestStatuses
  }
  const [normalized] = normalizeExtensionPaths([extensionPath])
  const remaining = normalizeExtensionPaths(settingsBridge.getPaths()).filter(
    (entry) => entry !== normalized
  )
  settingsBridge.setPaths(remaining)
  const partitions = settingsBridge.listPartitions()
  if (normalized) {
    unloadBrowserExtensionEverywhere(partitions, normalized)
  }
  // Why: recompute from the surviving folders so the UI drops the removed row even when the
  // session could not unload it (it is gone on next boot either way).
  latestStatuses = latestStatuses.filter((status) => status.path !== normalized)
  return latestStatuses
}
