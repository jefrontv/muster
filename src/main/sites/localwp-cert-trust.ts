// Trusting a LocalWP site's self-signed HTTPS certificate, ported from ocsites
// deploy/cert_trust.py.
//
// LocalWP issues a per-site TLS certificate under
// ~/Library/Application Support/Local/run/router/nginx/certs/<domain>.crt. Trusting it — so
// https://<domain> loads without a browser warning — imports it into the user's login keychain
// and adds trust-root settings there. The login keychain is writable by its owner and macOS reads
// it during TLS trust evaluation, so this needs no admin rights and must never prompt for
// elevation.
//
// macOS only by construction: `security` and the login keychain do not exist elsewhere, so every
// entry point answers "unsupported" off darwin instead of spawning anything.
//
// Error model: nothing here throws. Every outcome is a structured value carrying user-facing prose,
// because the caller is a wizard stage rendering the reason straight to a non-technical user.

import { execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'

export type { LocalWpCertStatus, LocalWpCertTrustResult }

/** Trust evaluation is a local computation; anything slower than this is a wedged `security`. */
const VERIFY_TIMEOUT_MS = 10_000
/** Keychain writes contend with the security daemon, so they get the wider budget ocsites used. */
const KEYCHAIN_TIMEOUT_MS = 30_000

const DEFAULT_WAIT_TIMEOUT_MS = 20_000
const POLL_INTERVAL_MS = 1_000

const SECURITY_BINARY = 'security'

const UNSUPPORTED_PLATFORM =
  'Trusting the local HTTPS certificate is only available on macOS, where LocalWP runs.'

const NO_DOMAIN =
  'This site has no local domain yet, so there is no HTTPS certificate to trust. ' +
  'Finish setting the site up in LocalWP first.'

const NOT_GENERATED =
  'LocalWP has not written the HTTPS certificate yet. Set up HTTPS to start the site and issue it.'

/**
 * The exact message ocsites returned, kept verbatim: it is the one the user sees after pressing
 * Trust too early, and it has to name the next step rather than read as a failure.
 */
const CERT_MISSING_FOR_TRUST = 'certificate not found — start the site over HTTPS, then retry'

const WAITING_FOR_CERT = 'Waiting for LocalWP to generate the HTTPS certificate…'

export type LocalWpCertCommandResult = { code: number; stdout: string; stderr: string }

export type LocalWpCertCommandRunner = (
  file: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<LocalWpCertCommandResult>

/**
 * The injected machine surface: subprocesses, the filesystem and the clock. Everything the keychain
 * logic touches lives behind this seam so tests never invoke `security` or read a real certificate.
 */
export type LocalWpCertDeps = {
  platform: NodeJS.Platform
  run: LocalWpCertCommandRunner
  fileExists: (filePath: string) => boolean
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/**
 * Resolves a nonzero exit instead of rejecting, so a missing binary or a spawn failure reads the
 * same as "the command said no" — the reference deliberately treated both as an untrusted answer.
 */
const runSecurityCommand: LocalWpCertCommandRunner = (file, args, timeoutMs) => {
  const { promise, resolve } = Promise.withResolvers<LocalWpCertCommandResult>()
  let settled = false
  let child: ChildProcess | undefined

  const settle = (result: LocalWpCertCommandResult): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimeout(timer)
    resolve(result)
  }

  // Why: Node's execFile timeout only signals the child; a stuck callback would otherwise leave the
  // trust flow pending forever behind a wedged security daemon.
  const timer = setTimeout(() => {
    child?.kill()
    settle({ code: 1, stdout: '', stderr: `${file} timed out after ${timeoutMs}ms` })
  }, timeoutMs)

  try {
    child = execFile(file, [...args], { timeout: timeoutMs }, (error, stdout, stderr) => {
      settle({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr)
      })
    })
  } catch (error) {
    settle({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
  }
  return promise
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

export function createLocalWpCertDeps(overrides: Partial<LocalWpCertDeps> = {}): LocalWpCertDeps {
  return {
    platform: process.platform,
    run: runSecurityCommand,
    fileExists: (filePath) => existsSync(filePath),
    sleep: delay,
    now: () => Date.now(),
    ...overrides
  }
}

/**
 * The certificate LocalWP's nginx router would write for `domain`, which may not exist yet. The
 * base comes from the running user's home directory — Local keys everything off it.
 */
export function localWpCertPath(domain: string): string {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Local',
    'run',
    'router',
    'nginx',
    'certs',
    `${domain}.crt`
  )
}

export async function getLocalWpCertStatus(
  domain: string,
  deps: Partial<LocalWpCertDeps> = {}
): Promise<LocalWpCertStatus> {
  const resolved = createLocalWpCertDeps(deps)
  const trimmed = domain.trim()

  if (resolved.platform !== 'darwin') {
    return {
      supported: false,
      domain: trimmed,
      certPath: '',
      exists: false,
      trusted: false,
      reason: UNSUPPORTED_PLATFORM
    }
  }
  if (trimmed.length === 0) {
    return {
      supported: false,
      domain: '',
      certPath: '',
      exists: false,
      trusted: false,
      reason: NO_DOMAIN
    }
  }

  const certPath = localWpCertPath(trimmed)
  if (!resolved.fileExists(certPath)) {
    return {
      supported: true,
      domain: trimmed,
      certPath,
      exists: false,
      trusted: false,
      reason: NOT_GENERATED
    }
  }

  const trusted = await isCertTrusted(certPath, resolved)
  return {
    supported: true,
    domain: trimmed,
    certPath,
    exists: true,
    trusted,
    reason: trusted
      ? ''
      : `The certificate for ${trimmed} is not trusted yet, so the browser will warn on ` +
        `https://${trimmed}.`
  }
}

/**
 * Polls until LocalWP writes the certificate. A timeout is an ordinary outcome, not an error: Local
 * only mints the file once the site has been served over HTTPS, so a freshly migrated site legally
 * has none yet.
 */
export async function waitForLocalWpCert(
  domain: string,
  options: {
    timeoutMs?: number
    onStatus?: (message: string) => void
    deps?: Partial<LocalWpCertDeps>
  } = {}
): Promise<boolean> {
  const resolved = createLocalWpCertDeps(options.deps)
  const trimmed = domain.trim()
  if (resolved.platform !== 'darwin' || trimmed.length === 0) {
    return false
  }

  const certPath = localWpCertPath(trimmed)
  const deadline = resolved.now() + (options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
  let notified = false

  while (resolved.now() < deadline) {
    if (resolved.fileExists(certPath)) {
      return true
    }
    if (options.onStatus && !notified) {
      notified = true
      options.onStatus(WAITING_FOR_CERT)
    }
    await resolved.sleep(POLL_INTERVAL_MS)
  }
  // One last look: the final sleep can straddle the deadline, and a zero timeout must still answer
  // truthfully for a certificate that is already on disk.
  return resolved.fileExists(certPath)
}

export async function trustLocalWpCert(
  domain: string,
  options: {
    onStatus?: (message: string) => void
    deps?: Partial<LocalWpCertDeps>
  } = {}
): Promise<LocalWpCertTrustResult> {
  const resolved = createLocalWpCertDeps(options.deps)
  const trimmed = domain.trim()
  if (resolved.platform !== 'darwin') {
    return { ok: false, message: UNSUPPORTED_PLATFORM }
  }
  if (trimmed.length === 0) {
    return { ok: false, message: NO_DOMAIN }
  }

  const certPath = localWpCertPath(trimmed)
  if (!resolved.fileExists(certPath)) {
    return { ok: false, message: CERT_MISSING_FOR_TRUST }
  }

  options.onStatus?.(`Trusting the ${trimmed} certificate…`)

  // The user's own keychain, never the system one: writing here is what keeps the whole flow free
  // of sudo and of an authorization prompt.
  const keychain = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db')

  // Importing is idempotent and fails once the certificate is already in the keychain, which is the
  // common case on a retry. Its exit code says nothing about trust, so add-trusted-cert decides.
  try {
    await resolved.run(SECURITY_BINARY, ['import', certPath, '-k', keychain], KEYCHAIN_TIMEOUT_MS)
  } catch {
    // Ignored deliberately: see above.
  }

  // Do NOT pass -p. Restricting the setting to a single policy omits the Result Type, the trust is
  // silently incomplete, and verify-cert then fails even though the command exited 0.
  let result: LocalWpCertCommandResult
  try {
    result = await resolved.run(
      SECURITY_BINARY,
      ['add-trusted-cert', '-r', 'trustRoot', '-k', keychain, certPath],
      KEYCHAIN_TIMEOUT_MS
    )
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  if (result.code === 0) {
    return {
      ok: true,
      message:
        `Trusted the ${trimmed} certificate — https://${trimmed} will now load ` +
        'without a warning.'
    }
  }
  const detail = (result.stderr.trim() || result.stdout.trim()).split('\n')[0]?.trim() ?? ''
  return { ok: false, message: `trust failed: ${detail || 'unknown error'}` }
}

async function isCertTrusted(certPath: string, deps: LocalWpCertDeps): Promise<boolean> {
  try {
    const result = await deps.run(
      SECURITY_BINARY,
      ['verify-cert', '-c', certPath],
      VERIFY_TIMEOUT_MS
    )
    return result.code === 0
  } catch {
    // A missing `security` binary means trust cannot be established, not that the caller should
    // deal with an exception mid-wizard.
    return false
  }
}
