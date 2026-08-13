// IPC for trusting a LocalWP site's HTTPS certificate.
//
// Follows ipc/site-setup.ts: a removeHandler prologue so a re-register cannot double-bind, tagged
// SiteResult unions instead of exceptions across the bridge, and bounded validation on every
// argument.
//
// The domain is interpolated straight into a filesystem path under Local's certificate directory
// and then handed to `security`, so it is treated as untrusted input: a separator, a parent hop or
// anything outside the hostname alphabet is rejected here rather than sanitised downstream.

import { ipcMain } from 'electron'
import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
import { SITE_LOCAL_STACKS, type SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import { providerFor } from '../sites/local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import '../sites/agent-local-site-control'
import { failure, requireSite, type SiteResult } from './sites-result'

const LOCALWP_CERT_CHANNELS = [
  'localwpCert:status',
  'localwpCert:trust',
  'localwpCert:ensure'
] as const

/** The DNS limit on a fully qualified name; LocalWP domains are far shorter. */
const MAX_DOMAIN_LENGTH = 253

/** Hostname alphabet only, and never leading with a dot or hyphen — which also kills `../`. */
const DOMAIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/

export function registerLocalWpCertHandlers(store?: Store): void {
  for (const channel of LOCALWP_CERT_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'localwpCert:status',
    async (_event, args: unknown): Promise<SiteResult<LocalWpCertStatus>> => {
      try {
        const input = (args ?? {}) as { domain?: unknown; stack?: unknown }
        const domain = requireDomain(input.domain)
        return { ok: true, value: await providerFor(readStack(input.stack)).certStatus(domain) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'localwpCert:trust',
    async (_event, args: unknown): Promise<SiteResult<LocalWpCertTrustResult>> => {
      try {
        const input = (args ?? {}) as { domain?: unknown; stack?: unknown }
        const domain = requireDomain(input.domain)
        return { ok: true, value: await providerFor(readStack(input.stack)).certTrust(domain) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'localwpCert:ensure',
    async (_event, args: unknown): Promise<SiteResult<LocalWpCertTrustResult>> => {
      try {
        const input = (args ?? {}) as { domain?: unknown; stack?: unknown; siteId?: unknown }
        const domain = requireDomain(input.domain)
        if (typeof input.siteId !== 'string' || input.siteId.length === 0) {
          throw new TypeError('siteId must be a non-empty string')
        }
        if (!store) {
          throw new Error('Site store is not available.')
        }
        const site = requireSite(store, input.siteId)
        const provider = providerFor(readStack(input.stack))
        const value = provider.certEnsure
          ? await provider.certEnsure(domain, {
              path: site.path,
              localStack: site.localStack,
              localWpRoot: site.localWpRoot
            })
          : await provider.certTrust(domain)
        return { ok: true, value }
      } catch (error) {
        return failure(error)
      }
    }
  )
}

/**
 * Which stack owns this domain's certificate.
 *
 * The channel carries only a domain — it predates there being more than one stack — so the caller
 * passes the site's stack alongside it. Absent means LocalWP, which is what every existing caller
 * means, and keeps the renderer's channel names and call sites unchanged.
 */
function readStack(value: unknown): SiteLocalStack {
  return SITE_LOCAL_STACKS.some((stack) => stack === value) ? (value as SiteLocalStack) : 'localwp'
}

function requireDomain(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('domain must be a string')
  }
  const domain = value.trim()
  if (domain.length === 0 || domain.length > MAX_DOMAIN_LENGTH) {
    throw new TypeError(
      `domain must be a non-empty string of at most ${MAX_DOMAIN_LENGTH} characters`
    )
  }
  if (!DOMAIN_PATTERN.test(domain) || domain.includes('..')) {
    throw new TypeError('domain must be a hostname — no path separators or ".." segments')
  }
  return domain
}
