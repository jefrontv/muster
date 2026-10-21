// Puts a Muster-signed certificate in front of a LocalWP site: System keychain, trust, file swap,
// restart, then proof that Local serves it. Any failure restores Local's own pair so the caller can
// fall back to trusting that one.
//
// The keychain work is split because the one-call form fails on macOS 26: root (osascript) can add
// certificates but cannot show the trust dialog, and the user can trust but cannot write the System
// keychain.

import path from 'node:path'
import { connect as tlsConnect } from 'node:tls'
import { getCanonicalUserDataPath } from '../persistence'
import {
  isCertTrusted,
  localWpCertPath,
  TRUST_PROMPT_TIMEOUT_MS,
  waitForCertTrusted
} from './localwp-cert-trust'
import {
  canSignForDomain,
  certFingerprint,
  commandDetail,
  createSigningCertDeps,
  ensureSigningCert,
  ensureSiteCert,
  isInSystemKeychain,
  signingCertPaths,
  SIGNING_CERT_SUFFIXES,
  SYSTEM_KEYCHAIN,
  type SigningCertDeps
} from './localwp-signing-cert'
import { ensureSiteRunning, stopSite } from './localwp-site-control'
import type { LocalWpCertTrustResult } from '../../shared/localwp-cert-types'

const SERVED_CHECK_TIMEOUT_MS = 15_000
const SERVED_PROBE_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 1_000
const ORIGINAL_SUFFIX = '.local-original'

export type SigningInstallDeps = {
  cert: SigningCertDeps
  userDataPath: () => string
  restartSite: (
    sitePath: string,
    onStatus?: (message: string) => void,
    signal?: AbortSignal
  ) => Promise<{ ok: boolean; message: string }>
  /** SHA-256 of the certificate the site's port 443 hands out, in `certFingerprint` form. */
  servedFingerprint: (domain: string) => Promise<string | null>
}

async function restartLocalWpSite(
  sitePath: string,
  onStatus?: (message: string) => void,
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  const stopped = await stopSite(sitePath, { onStatus, signal })
  if (!stopped.ok) {
    return { ok: false, message: stopped.message }
  }
  const started = await ensureSiteRunning(sitePath, { onStatus, signal })
  return { ok: started.state === 'running', message: started.message }
}

export function readServedFingerprint(domain: string): Promise<string | null> {
  const { promise, resolve } = Promise.withResolvers<string | null>()
  const socket = tlsConnect({
    host: domain,
    port: 443,
    servername: domain,
    rejectUnauthorized: false,
    timeout: SERVED_PROBE_TIMEOUT_MS
  })
  const finish = (value: string | null): void => {
    socket.destroy()
    resolve(value)
  }
  socket.once('secureConnect', () =>
    finish(socket.getPeerCertificate().fingerprint256?.replace(/:/g, '').toUpperCase() ?? null)
  )
  socket.once('timeout', () => finish(null))
  socket.once('error', () => finish(null))
  return promise
}

function createSigningInstallDeps(overrides: Partial<SigningInstallDeps> = {}): SigningInstallDeps {
  return {
    cert: createSigningCertDeps(),
    userDataPath: getCanonicalUserDataPath,
    restartSite: restartLocalWpSite,
    servedFingerprint: readServedFingerprint,
    ...overrides
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** `do shell script … with administrator privileges`: the admin dialog, and root for the write. */
function adminAddCertificatesScript(certPaths: string[]): string {
  const command = [
    '/usr/bin/security',
    'add-certificates',
    '-k',
    SYSTEM_KEYCHAIN,
    ...certPaths.map(shellQuote)
  ].join(' ')
  const appleScriptString = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `do shell script "${appleScriptString} 2>&1" with administrator privileges`
}

type Step = { ok: true } | { ok: false; message: string }

async function addToSystemKeychain(
  certs: { certPath: string; fingerprint: string }[],
  deps: SigningCertDeps,
  onStatus?: (message: string) => void
): Promise<Step> {
  const missing: typeof certs = []
  for (const cert of certs) {
    if (!(await isInSystemKeychain(cert.fingerprint, deps))) {
      missing.push(cert)
    }
  }
  if (missing.length === 0) {
    return { ok: true }
  }
  onStatus?.('Adding certificates to the System keychain. macOS will ask for an admin password…')
  const result = await deps.run(
    'osascript',
    ['-e', adminAddCertificatesScript(missing.map((cert) => cert.certPath))],
    TRUST_PROMPT_TIMEOUT_MS
  )
  if (result.code !== 0) {
    return { ok: false, message: `System keychain write failed: ${commandDetail(result)}` }
  }
  for (const cert of missing) {
    if (!(await isInSystemKeychain(cert.fingerprint, deps))) {
      return { ok: false, message: `${cert.certPath} is still not in the System keychain.` }
    }
  }
  return { ok: true }
}

/** As the user, so macOS can show its own dialog; no `-k`, so nothing is written to a keychain. */
async function trustSigningCert(
  certPath: string,
  deps: SigningCertDeps,
  onStatus?: (message: string) => void
): Promise<Step> {
  if (await isCertTrusted(certPath, deps)) {
    return { ok: true }
  }
  onStatus?.("Trusting Muster's signing certificate. macOS will ask for your password…")
  const result = await deps.run(
    '/usr/bin/security',
    ['add-trusted-cert', '-d', '-r', 'trustRoot', certPath],
    TRUST_PROMPT_TIMEOUT_MS
  )
  if (result.code !== 0) {
    return {
      ok: false,
      message: result.timedOut
        ? 'macOS was still waiting for your password when the trust step gave up.'
        : `Trusting the signing certificate failed: ${commandDetail(result)}`
    }
  }
  return (await waitForCertTrusted(certPath, deps))
    ? { ok: true }
    : { ok: false, message: 'macOS accepted the signing certificate but has not applied trust.' }
}

async function waitForServed(
  domain: string,
  fingerprint: string,
  deps: SigningInstallDeps
): Promise<boolean> {
  const deadline = deps.cert.now() + SERVED_CHECK_TIMEOUT_MS
  while (deps.cert.now() < deadline) {
    if ((await deps.servedFingerprint(domain)) === fingerprint) {
      return true
    }
    await deps.cert.sleep(POLL_INTERVAL_MS)
  }
  return (await deps.servedFingerprint(domain)) === fingerprint
}

export async function installSigningCertForLocalWpSite(
  domain: string,
  sitePath: string,
  options: {
    onStatus?: (message: string) => void
    signal?: AbortSignal
    deps?: Partial<SigningInstallDeps>
  } = {}
): Promise<LocalWpCertTrustResult> {
  const deps = createSigningInstallDeps(options.deps)
  const { onStatus, signal } = options
  if (deps.cert.platform !== 'darwin') {
    return { ok: false, message: "Muster's signing certificate is only available on macOS." }
  }
  if (!canSignForDomain(domain)) {
    const suffixes = SIGNING_CERT_SUFFIXES.map((suffix) => `.${suffix}`).join(', ')
    return { ok: false, message: `${domain} does not end in ${suffixes}.` }
  }

  const paths = signingCertPaths(deps.userDataPath())
  const signer = await ensureSigningCert(paths, deps.cert)
  if (!signer.ok) {
    return signer
  }
  if (signer.created) {
    onStatus?.(`Created "${paths.name}" in ${paths.dir}`)
  }
  const site = await ensureSiteCert(domain, paths, deps.cert)
  if (!site.ok || !site.certPath || !site.keyPath) {
    return site.ok ? { ok: false, message: `No certificate was signed for ${domain}.` } : site
  }
  const signerFingerprint = await certFingerprint(paths.certPath, deps.cert)
  const siteFingerprint = await certFingerprint(site.certPath, deps.cert)
  if (!signerFingerprint || !siteFingerprint) {
    return { ok: false, message: 'Could not read the fingerprints of the new certificates.' }
  }

  const added = await addToSystemKeychain(
    [
      { certPath: paths.certPath, fingerprint: signerFingerprint },
      { certPath: site.certPath, fingerprint: siteFingerprint }
    ],
    deps.cert,
    onStatus
  )
  if (!added.ok) {
    return added
  }
  const trusted = await trustSigningCert(paths.certPath, deps.cert, onStatus)
  if (!trusted.ok) {
    return trusted
  }

  const localCert = localWpCertPath(domain)
  const localKey = path.join(path.dirname(localCert), `${domain}.key`)
  // First run only: a later run would back up Muster's own pair over Local's original.
  if (!deps.cert.fileExists(`${localCert}${ORIGINAL_SUFFIX}`)) {
    await deps.cert.files.copy(localCert, `${localCert}${ORIGINAL_SUFFIX}`)
    await deps.cert.files.copy(localKey, `${localKey}${ORIGINAL_SUFFIX}`)
  }
  await deps.cert.files.copy(site.keyPath, localKey)
  await deps.cert.files.copy(site.certPath, localCert)

  const restore = async (reason: string): Promise<LocalWpCertTrustResult> => {
    await deps.cert.files.copy(`${localCert}${ORIGINAL_SUFFIX}`, localCert)
    await deps.cert.files.copy(`${localKey}${ORIGINAL_SUFFIX}`, localKey)
    const restarted = await deps.restartSite(sitePath, onStatus, signal)
    return {
      ok: false,
      message: restarted.ok
        ? `${reason} Restored LocalWP's own certificate.`
        : `${reason} Restored LocalWP's own certificate files, but the restart failed: ${restarted.message}`
    }
  }

  onStatus?.('Restarting the site in LocalWP so it serves the new certificate…')
  const restarted = await deps.restartSite(sitePath, onStatus, signal)
  if (!restarted.ok) {
    return restore(`LocalWP could not restart the site: ${restarted.message}`)
  }
  if (!(await waitForServed(domain, siteFingerprint, deps))) {
    return restore(`LocalWP is still serving its own certificate for ${domain}.`)
  }
  if (!(await waitForCertTrusted(localCert, deps.cert))) {
    return restore(`macOS does not trust the new ${domain} certificate.`)
  }
  return {
    ok: true,
    message:
      `Trusted ${domain} with "${paths.name}". https://${domain} loads without a warning, ` +
      'and LocalWP shows the certificate as trusted.'
  }
}
