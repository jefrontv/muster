// Opens an extension's own popup/options page in a dedicated window.
//
// Chromium refuses to render chrome-extension:// pages inside a <webview> guest — navigation
// silently no-ops — so an extension that keeps its configuration in a popup is unreachable in
// Muster, which has no extension toolbar. A plain BrowserWindow on the browser partition can
// load the page, giving the extension its normal chrome.storage / chrome.runtime environment.

import * as electron from 'electron'
import type { BrowserWindow } from 'electron'
import { ORCA_BROWSER_PARTITION } from '../../shared/constants'
import type { OpenExtensionPageResult } from '../../shared/browser-extension-types'

const openWindows = new Map<string, BrowserWindow>()

export type { OpenExtensionPageResult }

function findLoadedExtension(
  extensionId: string,
  partition: string
): { id: string; name: string } | null {
  try {
    const sess = electron.session.fromPartition(partition)
    const match = sess.extensions?.getAllExtensions().find((entry) => entry.id === extensionId)
    return match ? { id: match.id, name: match.name } : null
  } catch {
    return null
  }
}

export function openExtensionSettingsPage(args: {
  extensionId: string
  page: string
  partition?: string
  parent?: BrowserWindow | null
}): OpenExtensionPageResult {
  const partition = args.partition ?? ORCA_BROWSER_PARTITION
  // Why: the id is IPC input; only pages of an extension actually loaded in this session may
  // open, so a compromised renderer cannot point this at an arbitrary chrome-extension origin.
  const loaded = findLoadedExtension(args.extensionId, partition)
  if (!loaded) {
    return { ok: false, reason: 'not-loaded', message: 'That extension is not loaded.' }
  }
  const page = args.page.trim().replace(/^\.?\//, '')
  if (!page || page.includes('..')) {
    return { ok: false, reason: 'no-page', message: 'Extension declares no settings page.' }
  }

  const existing = openWindows.get(loaded.id)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return { ok: true }
  }

  const window = new electron.BrowserWindow({
    width: 420,
    height: 560,
    title: loaded.name,
    parent: args.parent ?? undefined,
    show: false,
    webPreferences: {
      partition,
      // Why: this is extension-owned content — never hand it Muster's preload bridge.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  openWindows.set(loaded.id, window)
  window.on('closed', () => {
    openWindows.delete(loaded.id)
  })
  window.once('ready-to-show', () => window.show())

  try {
    void window.loadURL(`chrome-extension://${loaded.id}/${page}`)
  } catch (error) {
    window.destroy()
    openWindows.delete(loaded.id)
    return {
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: true }
}

export function closeExtensionSettingsWindows(): void {
  for (const window of openWindows.values()) {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
  openWindows.clear()
}
