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

/**
 * How long Local's router gets to mint the certificate after the site's socket is already up.
 *
 * The socket comes up first; the router is what waits on Local's own admin prompt, so this is a
 * human typing a password, not a machine completing a write. The shared default on
 * `waitForLocalWpCert` is 20s — right for a cert that is already being written, wrong for one
 * blocked behind an unanswered dialog, and the source of "it didn't wait for me to put my
 * password for the cert". Five minutes, matching TRUST_PROMPT_TIMEOUT_MS in localwp-cert-trust.ts
 * for the same class of wait.
 */
const ROUTER_CERT_PROMPT_TIMEOUT_MS = 5 * 60_000

/**
 * How long this path waits for Local to list the folder it was just told to serve. Local writes the
 * registry entry while it is still setting the site up, and the wizard arrives seconds later, so
 * the wait covers the gap between "the files are in app/public" and "Local has written sites.json".
 * Only this caller opts in — see DEFAULT_REGISTRATION_WAIT_MS.
 */
const REGISTRATION_WAIT_FOR_CREATE_MS = 60_000

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
    /** Cancels the ownership wait with the run that started it. */
    signal?: AbortSignal
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

  const certPath = localWpCertPath(trimmed)
  // Read once: the answer decides whether Local has to mint a certificate, never whether Local is
  // responsible for the folder.
  const certOnDisk = deps.certExists(certPath)

  // Ownership first, unconditionally. A `.crt` on disk is not evidence the site exists — it can be
  // left over from a site Local has since removed, and it is exactly what a retry finds. Gating
  // this whole step on the file (as it did) meant a retry trusted the stale certificate and went
  // green without Local ever being asked whether it owns the folder.
  options.onStatus?.('Checking the site is registered with LocalWP…')
  const started = await deps.ensureRunning(sitePath, {
    onStatus: options.onStatus,
    // Names the site in the wait prose — the only thing the user recognises.
    domain: trimmed,
    signal: options.signal,
    // The one caller that opts into the registry wait: this runs seconds after Local was told to
    // create or register the site, so "not listed yet" is a state worth waiting out. Every other
    // caller (siteStacks:start/stop, the import pipeline) keeps the default of no wait.
    registrationTimeoutMs: REGISTRATION_WAIT_FOR_CREATE_MS
  })
  if (started.state !== 'running') {
    const reason =
      started.message || 'LocalWP could not start the site, so no certificate was issued.'
    return {
      ok: false,
      message: certOnDisk
        ? `${reason} A certificate for ${trimmed} is already on disk, but that is left over from ` +
          `an earlier attempt and is not evidence the site exists — nothing was trusted.`
        : reason
    }
  }

  if (!certOnDisk) {
    options.onStatus?.(`Requesting https://${trimmed} so LocalWP writes the certificate…`)
    await deps.pokeHttps(trimmed)
    const written = await deps.waitForCert(trimmed, {
      onStatus: options.onStatus,
      timeoutMs: ROUTER_CERT_PROMPT_TIMEOUT_MS,
      ...(options.signal ? { signal: options.signal } : {}),
      deps: options.certDeps
    })
    if (!written) {
      // An aborted wait is not a timeout: saying "five minutes" after a Cancel would blame the
      // clock for something the user did.
      if (options.signal?.aborted === true) {
        return {
          ok: false,
          message: 'Cancelled while waiting for LocalWP to write the certificate.'
        }
      }
      return {
        ok: false,
        message:
          `LocalWP still has no certificate for ${trimmed} after five minutes. If the Local app ` +
          `is showing a password prompt, answer it, then press "Change and retry".`
      }
    }
  }

  // Unreachable without a passing ownership check above.
  return deps.trust(trimmed, { onStatus: options.onStatus, deps: options.certDeps })
}
