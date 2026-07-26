// The `muster://` URL scheme replaces ocsites' AppleScript handler app (OcsitesHandler.app).
// A dashboard link like `muster://configure?hostname=…&live-domain=…` opens Muster and starts
// the site bind flow. Registration happens at startup; URL handling lives in bind-url-intake.ts.

import { app } from 'electron'
import path from 'node:path'

export const SITE_BIND_URL_SCHEME = 'muster'

/** Legacy scheme from the ocsites CLI era — existing dashboard links must keep working. */
export const LEGACY_SITE_BIND_URL_SCHEME = 'ocsites'

/**
 * Claim `muster://` with the OS.
 *
 * Why not also claim `ocsites://`: `setAsDefaultProtocolClient` is an active takeover, and it runs
 * on every launch. Claiming the legacy scheme would seize it from an installed OcsitesHandler.app
 * each time Muster starts — even if the user reassigned it back — and ocsites is still the
 * authoritative tool until it is deliberately decommissioned.
 *
 * Legacy links keep working two ways regardless: the packaged Info.plist still lists `ocsites` as
 * a supported scheme (electron-builder `protocols`), so macOS routes to Muster once
 * OcsitesHandler.app is uninstalled and Muster is the only claimant; and parseSiteBindUrl accepts
 * the legacy scheme whenever a link reaches us by any route.
 *
 * In dev, Electron runs from `node_modules/electron` and the default registration would point the
 * OS at the Electron binary with no entry script, so the argv form is required.
 */
export function registerSiteBindUrlSchemes(isDev: boolean): void {
  if (isDev && process.platform === 'win32') {
    app.setAsDefaultProtocolClient(SITE_BIND_URL_SCHEME, process.execPath, [
      path.resolve(process.argv[1] ?? '')
    ])
    return
  }
  app.setAsDefaultProtocolClient(SITE_BIND_URL_SCHEME)
}
