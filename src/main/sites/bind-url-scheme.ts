// The `muster://` URL scheme opens Muster and starts the site bind flow from a dashboard link like
// `muster://configure?hostname=...&live-domain=...`. Registration happens at startup; URL handling
// lives in bind-url-intake.ts.

import { app } from 'electron'
import path from 'node:path'

// The scheme constants live in the pure parser beside the acceptance list they must agree with.
import { SITE_BIND_DEV_URL_SCHEME, SITE_BIND_URL_SCHEME } from './site-bind-url'

/**
 * Claim the bind scheme with the OS: `muster` from a packaged build, `musterdev` from a dev run.
 *
 * Why `ocsites://` is not claimed, advertised, or parsed: ocsites is a separate installed app that
 * owns that scheme. `setAsDefaultProtocolClient` is an active takeover that runs on every launch,
 * and listing the scheme in the packaged Info.plist lets macOS route legacy links here - either way
 * Muster would intercept links meant for OcsitesHandler.app. Legacy links stay with ocsites.
 *
 * Why dev gets its own scheme rather than none: the same takeover applies to Muster's own scheme.
 * A dev build claiming `muster` outranked the installed app and kept the claim after it exited,
 * sending every dashboard link to a bare Electron binary. Claiming `musterdev` instead keeps links
 * testable against dev, and releasing `muster` on every dev start hands ownership back in case an
 * older dev wrapper took it; the installed build re-claims it on its next launch.
 *
 * On Windows the dev binary is Electron itself with no entry script, so the argv form is required
 * for the OS to launch the right thing; on macOS the dev wrapper's Info.plist declares the scheme
 * (see config/scripts/run-electron-vite-dev.mjs) and the plain call suffices.
 */
export function registerSiteBindUrlSchemes(isDev: boolean): void {
  if (isDev) {
    // Best-effort: an OS that never recorded this binary as the handler has nothing to remove.
    app.removeAsDefaultProtocolClient?.(SITE_BIND_URL_SCHEME)
    if (process.platform === 'win32') {
      app.setAsDefaultProtocolClient(SITE_BIND_DEV_URL_SCHEME, process.execPath, [
        path.resolve(process.argv[1] ?? '')
      ])
      return
    }
    app.setAsDefaultProtocolClient(SITE_BIND_DEV_URL_SCHEME)
    return
  }
  app.setAsDefaultProtocolClient(SITE_BIND_URL_SCHEME)
}
