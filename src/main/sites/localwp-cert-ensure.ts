// Make LocalWP write its per-site HTTPS cert, then trust it — the ocsites wait-then-trust flow
// plus the missing trigger. Local only mints `<domain>.crt` after the site is up and something
// has shaken hands on 443; sitting on the wizard and clicking Trust never gets there.

import { existsSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { ensureSiteRunning } from './localwp-site-control'
import {
  localWpCertPath,
  trustLocalWpCert,
  waitForLocalWpCert,
  type LocalWpCertDeps
} from './localwp-cert-trust'
import type { LocalWpCertTrustResult } from '../../shared/localwp-cert-types'

const HTTPS_POKE_TIMEOUT_MS = 8_000

export type LocalWpCertEnsureDeps = {
  certExists: (certPath: string) => boolean
  ensureRunning: typeof ensureSiteRunning
  pokeHttps: (domain: string) => Promise<void>
  waitForCert: typeof waitForLocalWpCert
  trust: typeof trustLocalWpCert
}

export async function pokeLocalWpHttps(domain: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = httpsRequest(
      {
        hostname: domain,
        port: 443,
        path: '/',
        method: 'HEAD',
        rejectUnauthorized: false,
        timeout: HTTPS_POKE_TIMEOUT_MS
      },
      (response) => {
        response.resume()
        resolve()
      }
    )
    req.on('error', () => resolve())
    req.on('timeout', () => {
      req.destroy()
      resolve()
    })
    req.end()
  })
}

export async function ensureLocalWpHttpsCert(
  domain: string,
  sitePath: string,
  options: {
    onStatus?: (message: string) => void
    certDeps?: Partial<LocalWpCertDeps>
    deps?: Partial<LocalWpCertEnsureDeps>
  } = {}
): Promise<LocalWpCertTrustResult> {
  const trimmed = domain.trim()
  const deps: LocalWpCertEnsureDeps = {
    certExists: options.certDeps?.fileExists ?? existsSync,
    ensureRunning: ensureSiteRunning,
    pokeHttps: pokeLocalWpHttps,
    waitForCert: waitForLocalWpCert,
    trust: trustLocalWpCert,
    ...options.deps
  }
  if (trimmed.length === 0) {
    return { ok: false, message: 'This site has no local domain yet.' }
  }
  if (sitePath.trim().length === 0) {
    return { ok: false, message: 'This site has no local folder to start in LocalWP.' }
  }

  if (!deps.certExists(localWpCertPath(trimmed))) {
    options.onStatus?.('Starting the LocalWP site so it can issue an HTTPS certificate…')
    const started = await deps.ensureRunning(sitePath, { onStatus: options.onStatus })
    if (started.state !== 'running') {
      return {
        ok: false,
        message:
          started.message || 'LocalWP could not start the site, so no certificate was issued.'
      }
    }
    options.onStatus?.(`Requesting https://${trimmed} so LocalWP writes the certificate…`)
    await deps.pokeHttps(trimmed)
    const written = await deps.waitForCert(trimmed, {
      onStatus: options.onStatus,
      deps: options.certDeps
    })
    if (!written) {
      return {
        ok: false,
        message:
          `LocalWP still has no certificate for ${trimmed}. Confirm the site is running in Local, ` +
          `then try again.`
      }
    }
  }

  return deps.trust(trimmed, { onStatus: options.onStatus, deps: options.certDeps })
}
