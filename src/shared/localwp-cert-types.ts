// The contract for trusting LocalWP's per-site HTTPS certificate, ported from ocsites
// deploy/cert_trust.py.
//
// Split out of site-stack-types.ts because this is a self-contained macOS keychain concern with no
// bearing on the migration pipeline, and the preload surface lives here too so the bridge and the
// renderer agree by construction rather than by two hand-copied shapes — the same split
// site-setup-api-types.ts makes.

import type { SiteLocalStack, SiteResult } from './site-types'

export type LocalWpCertStatus = {
  /** false off darwin — `security` and the login keychain are macOS-only. */
  supported: boolean
  domain: string
  /** '' when the domain is empty, so the UI never shows a path for a site that has no domain. */
  certPath: string
  /** LocalWP writes the cert only after the site has been served over HTTPS once. */
  exists: boolean
  /** Passes `security verify-cert`, i.e. the browser will not warn. */
  trusted: boolean
  /**
   * User-facing prose explaining what is missing and what to do about it, distinct per case.
   * '' only when the certificate exists and is already trusted.
   */
  reason: string
}

export type LocalWpCertTrustResult = { ok: boolean; message: string }

/**
 * `stack` selects which local stack owns the certificate; omitted means LocalWP, so existing
 * callers keep working. The channel names stay `localwpCert:*` because renaming them would churn
 * the preload surface for no behavioural gain.
 */
export type LocalWpCertApi = {
  status: (args: {
    domain: string
    stack?: SiteLocalStack
  }) => Promise<SiteResult<LocalWpCertStatus>>
  trust: (args: {
    domain: string
    stack?: SiteLocalStack
  }) => Promise<SiteResult<LocalWpCertTrustResult>>
  /** Start the site if needed, wait for LocalWP to write the cert, then trust it. */
  ensure: (args: {
    domain: string
    siteId: string
    stack?: SiteLocalStack
  }) => Promise<SiteResult<LocalWpCertTrustResult>>
}
