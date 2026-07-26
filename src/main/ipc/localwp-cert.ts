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
import { getLocalWpCertStatus, trustLocalWpCert } from '../sites/localwp-cert-trust'
import { failure, type SiteResult } from './sites-result'

const LOCALWP_CERT_CHANNELS = ['localwpCert:status', 'localwpCert:trust'] as const

/** The DNS limit on a fully qualified name; LocalWP domains are far shorter. */
const MAX_DOMAIN_LENGTH = 253

/** Hostname alphabet only, and never leading with a dot or hyphen — which also kills `../`. */
const DOMAIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/

export function registerLocalWpCertHandlers(): void {
  for (const channel of LOCALWP_CERT_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'localwpCert:status',
    async (_event, args: unknown): Promise<SiteResult<LocalWpCertStatus>> => {
      try {
        const input = (args ?? {}) as { domain?: unknown }
        return { ok: true, value: await getLocalWpCertStatus(requireDomain(input.domain)) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'localwpCert:trust',
    async (_event, args: unknown): Promise<SiteResult<LocalWpCertTrustResult>> => {
      try {
        const input = (args ?? {}) as { domain?: unknown }
        return { ok: true, value: await trustLocalWpCert(requireDomain(input.domain)) }
      } catch (error) {
        return failure(error)
      }
    }
  )
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
