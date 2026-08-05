/** One configured unpacked extension directory and the outcome of its last load attempt. */
export type BrowserExtensionStatus = {
  path: string
  /** Chromium extension id, present only once the extension loaded. */
  id: string | null
  name: string | null
  version: string | null
  /** Relative path of the extension's popup or options page, when it declares one. */
  settingsPage: string | null
  /** Human-readable reason the extension is not active, or null when loaded. */
  error: string | null
}

export type BrowserExtensionAddResult =
  | { ok: true; status: BrowserExtensionStatus }
  | { ok: false; reason: 'cancelled' | 'duplicate' | 'invalid'; message: string | null }

export type OpenExtensionPageResult =
  | { ok: true }
  | { ok: false; reason: 'not-loaded' | 'no-page' | 'failed'; message: string | null }

/** Extensions Muster ships and can install itself. */
export type BundledExtensionId = 'wordpress-login-autofill'

export type BundledExtensionInfo = {
  id: BundledExtensionId
  name: string
  description: string
  installed: boolean
  /** Absolute install path once installed, so the generic list can match it. */
  path: string | null
  /** True when the installed copy is also in the active extension paths. */
  enabled: boolean
}

export type WordPressLoginAutofillConfig = {
  username: string
  password: string
  autoLogin: boolean
}

/** Password presence only — the secret itself never crosses IPC back to the renderer. */
export type WordPressLoginAutofillStatus = {
  username: string
  autoLogin: boolean
  hasPassword: boolean
}

export type BundledExtensionActionResult =
  | { ok: true; info: BundledExtensionInfo }
  | { ok: false; message: string }

export type SetWordPressLoginResult =
  | { ok: true; status: WordPressLoginAutofillStatus }
  | { ok: false; message: string }
