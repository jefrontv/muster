// The `muster://` URL scheme opens Muster and starts the site bind flow from a dashboard link like
// `muster://configure?hostname=…&live-domain=…`. Registration happens at startup; URL handling
// lives in bind-url-intake.ts.

import { app } from 'electron'

// The scheme constant lives in the pure parser beside the acceptance list it must agree with.
import { SITE_BIND_URL_SCHEME } from './site-bind-url'

/**
 * Claim `muster://` with the OS — from a packaged build only.
 *
 * Why `ocsites://` is not claimed, advertised, or parsed: ocsites is a separate installed app that
 * owns that scheme. `setAsDefaultProtocolClient` is an active takeover that runs on every launch,
 * and listing the scheme in the packaged Info.plist lets macOS route legacy links here — either way
 * Muster would intercept links meant for OcsitesHandler.app. Legacy links stay with ocsites.
 *
 * Why a dev run claims nothing and actively hands the scheme back: the same takeover applies to
 * Muster's own scheme. A dev build runs from `node_modules/electron`, so claiming pointed the OS at
 * a bare Electron binary — every `muster://` link the user clicked went to a dev instance that may
 * not be running, instead of to their installed app, and it stayed that way after the dev run
 * ended. Releasing the claim on every dev start puts ownership back where the user expects it,
 * because the installed build re-claims it on its next launch.
 */
export function registerSiteBindUrlSchemes(isDev: boolean): void {
  if (isDev) {
    // Best-effort: an OS that never recorded this binary as the handler has nothing to remove.
    app.removeAsDefaultProtocolClient?.(SITE_BIND_URL_SCHEME)
    return
  }
  app.setAsDefaultProtocolClient(SITE_BIND_URL_SCHEME)
}
