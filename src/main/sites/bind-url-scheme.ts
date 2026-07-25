// The `muster://` URL scheme replaces ocsites' AppleScript handler app (OcsitesHandler.app).
// A dashboard link like `muster://configure?hostname=…&live-domain=…` opens Muster and starts
// the site bind flow. Registration happens at startup; URL handling lives in bind-url-intake.ts.

import { app } from 'electron'
import path from 'node:path'

export const SITE_BIND_URL_SCHEME = 'muster'

/** Legacy scheme from the ocsites CLI era — existing dashboard links must keep working. */
export const LEGACY_SITE_BIND_URL_SCHEME = 'ocsites'

/**
 * Claim both schemes with the OS.
 *
 * In dev, Electron runs from `node_modules/electron` and the default registration would point the
 * OS at the Electron binary with no entry script, so the argv form is required.
 */
export function registerSiteBindUrlSchemes(isDev: boolean): void {
  const schemes = [SITE_BIND_URL_SCHEME, LEGACY_SITE_BIND_URL_SCHEME]
  for (const scheme of schemes) {
    if (isDev && process.platform === 'win32') {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [
        path.resolve(process.argv[1] ?? '')
      ])
      continue
    }
    app.setAsDefaultProtocolClient(scheme)
  }
}
