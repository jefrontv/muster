// Install / enable / configure orchestration for Muster's own bundled extensions.
//
// Shared by the settings UI and the CLI (agent harnesses), so both paths apply the same steps in
// the same order: copy out of resources, write credentials, add to the loaded extension paths.

import type {
  BundledExtensionActionResult,
  BundledExtensionInfo,
  SetWordPressLoginResult,
  WordPressLoginAutofillConfig,
  WordPressLoginAutofillStatus
} from '../../shared/browser-extension-types'
import {
  BUNDLED_EXTENSIONS,
  getBundledExtensionDefinition,
  getInstalledBundledExtensionDir,
  installBundledExtension,
  isBundledExtensionInstalled,
  uninstallBundledExtension,
  writeWordPressLoginConfig
} from './browser-extension-bundles'
import {
  clearExtensionSecret,
  hasExtensionSecret,
  readExtensionSecret,
  writeExtensionSecret
} from './browser-extension-secret-store'
import {
  addBrowserExtensionPath,
  getBrowserExtensionSettings,
  reloadBrowserExtensionsEverywhere,
  removeBrowserExtensionPath
} from './browser-extension-service'

const WORDPRESS_SECRET_KEY = 'wordpress-login-autofill.password'

export function listBundledExtensions(): BundledExtensionInfo[] {
  const activePaths = getBrowserExtensionSettings()?.getPaths() ?? []
  return BUNDLED_EXTENSIONS.map((definition) => {
    const installed = isBundledExtensionInstalled(definition.slug)
    const installPath = installed ? getInstalledBundledExtensionDir(definition.slug) : null
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      installed,
      path: installPath,
      enabled: installPath !== null && activePaths.includes(installPath)
    }
  })
}

export type { BundledExtensionActionResult }

function findInfo(id: string): BundledExtensionInfo | null {
  return listBundledExtensions().find((entry) => entry.id === id) ?? null
}

/** Copies the shipped files into userData and registers the folder so it loads. */
export async function installAndEnableBundledExtension(
  id: string
): Promise<BundledExtensionActionResult> {
  const definition = getBundledExtensionDefinition(id)
  if (!definition) {
    return { ok: false, message: `Unknown bundled extension: ${id}` }
  }
  const installed = installBundledExtension(id)
  if (!installed.ok) {
    return { ok: false, message: installed.message }
  }
  // Why: restore any previously configured credentials so re-installing (or a Muster upgrade
  // replacing the files) does not silently leave the extension inert.
  const password = readExtensionSecret(WORDPRESS_SECRET_KEY)
  if (id === 'wordpress-login-autofill' && password) {
    const existing = getWordPressLoginStatus()
    writeWordPressLoginConfig({
      username: existing.username,
      password,
      autoLogin: existing.autoLogin
    })
  }

  const added = await addBrowserExtensionPath(installed.path, definition.name, '1.0.0')
  if (!added.ok && added.reason !== 'duplicate') {
    return { ok: false, message: added.message ?? 'Could not enable the extension.' }
  }
  const info = findInfo(id)
  return info ? { ok: true, info } : { ok: false, message: 'Install succeeded but state is stale.' }
}

export async function disableBundledExtension(id: string): Promise<BundledExtensionActionResult> {
  const definition = getBundledExtensionDefinition(id)
  if (!definition) {
    return { ok: false, message: `Unknown bundled extension: ${id}` }
  }
  await removeBrowserExtensionPath(getInstalledBundledExtensionDir(definition.slug))
  const info = findInfo(id)
  return info ? { ok: true, info } : { ok: false, message: 'Unknown bundled extension state.' }
}

/** Disables, deletes the installed copy, and forgets the stored password. */
export async function uninstallBundledExtensionCompletely(
  id: string
): Promise<BundledExtensionActionResult> {
  await disableBundledExtension(id)
  uninstallBundledExtension(id)
  if (id === 'wordpress-login-autofill') {
    clearExtensionSecret(WORDPRESS_SECRET_KEY)
  }
  const info = findInfo(id)
  return info ? { ok: true, info } : { ok: false, message: 'Unknown bundled extension state.' }
}

type WordPressSettingsBridge = {
  getUsername: () => string
  getAutoLogin: () => boolean
  setConfig: (config: { username: string; autoLogin: boolean }) => void
}

let wordPressSettingsBridge: WordPressSettingsBridge | null = null

export function registerWordPressLoginSettingsBridge(bridge: WordPressSettingsBridge): void {
  wordPressSettingsBridge = bridge
}

export function getWordPressLoginStatus(): WordPressLoginAutofillStatus {
  return {
    username: wordPressSettingsBridge?.getUsername() ?? '',
    autoLogin: wordPressSettingsBridge?.getAutoLogin() ?? false,
    hasPassword: hasExtensionSecret(WORDPRESS_SECRET_KEY)
  }
}

export type { SetWordPressLoginResult }

/**
 * Persists credentials and regenerates the installed extension's config.js. An empty password
 * keeps whatever is already stored, so the UI never has to round-trip the secret to change a flag.
 */
export async function setWordPressLoginConfig(input: {
  username: string
  password?: string | null
  autoLogin: boolean
}): Promise<SetWordPressLoginResult> {
  const username = input.username.trim()
  try {
    if (typeof input.password === 'string' && input.password.length > 0) {
      writeExtensionSecret(WORDPRESS_SECRET_KEY, input.password)
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  wordPressSettingsBridge?.setConfig({ username, autoLogin: input.autoLogin })

  const password = readExtensionSecret(WORDPRESS_SECRET_KEY)
  if (isBundledExtensionInstalled('wordpress-login-autofill')) {
    const config: WordPressLoginAutofillConfig = {
      username,
      password: password ?? '',
      autoLogin: input.autoLogin
    }
    if (!writeWordPressLoginConfig(config)) {
      return { ok: false, message: 'Could not write the extension configuration file.' }
    }
    await reloadInstalledExtensions()
  }
  return { ok: true, status: getWordPressLoginStatus() }
}

export async function clearWordPressLoginPassword(): Promise<WordPressLoginAutofillStatus> {
  clearExtensionSecret(WORDPRESS_SECRET_KEY)
  if (isBundledExtensionInstalled('wordpress-login-autofill')) {
    const status = getWordPressLoginStatus()
    writeWordPressLoginConfig({
      username: status.username,
      password: '',
      autoLogin: status.autoLogin
    })
    await reloadInstalledExtensions()
  }
  return getWordPressLoginStatus()
}

/** Unload + load so Chromium re-reads the regenerated config.js. */
async function reloadInstalledExtensions(): Promise<void> {
  const partitions = getBrowserExtensionSettings()?.listPartitions() ?? []
  if (partitions.length > 0) {
    await reloadBrowserExtensionsEverywhere(partitions, { force: true })
  }
}
