// The `muster://` URL scheme opens Muster and starts the site bind flow from a dashboard link like
// `muster://configure?hostname=…&live-domain=…`. Registration happens at startup; URL handling
// lives in bind-url-intake.ts.

import { app } from 'electron'
import path from 'node:path'

// The scheme constant lives in the pure parser beside the acceptance list it must agree with.
import { SITE_BIND_URL_SCHEME } from './site-bind-url'

/**
 * Claim `muster://` with the OS.
 *
 * Why `ocsites://` is not claimed, advertised, or parsed: ocsites is a separate installed app that
 * owns that scheme. `setAsDefaultProtocolClient` is an active takeover that runs on every launch,
 * and listing the scheme in the packaged Info.plist lets macOS route legacy links here — either way
 * Muster would intercept links meant for OcsitesHandler.app. Legacy links stay with ocsites.
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
