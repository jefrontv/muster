// HTTPS for DDEV sites. DDEV's router issues every site certificate from mkcert's local root, so the
// one thing to trust is that root, not a per-site file. Trust goes into the login keychain, the same
// way LocalWP's does (see localwp-cert-trust.ts for why that swaps an admin prompt for a user one).

import os from 'node:os'
import path from 'node:path'
import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
import { createDdevHost, type DdevHost } from './ddev-host'
import { createLocalWpCertDeps, type LocalWpCertCommandRunner } from './localwp-cert-trust'

const VERIFY_TIMEOUT_MS = 10_000
/** The user has to notice the macOS authentication dialog and type a password. */
const TRUST_PROMPT_TIMEOUT_MS = 5 * 60_000

export const DDEV_CERT_UNSUPPORTED = 'Trusting HTTPS from Muster is only available on macOS.'
export const DDEV_MKCERT_MISSING =
  'mkcert is not installed, so DDEV cannot issue trusted certificates. Run `brew install mkcert`, then retry.'

export type DdevCertDeps = { host: DdevHost; run: LocalWpCertCommandRunner }

function resolveDeps(deps: Partial<DdevCertDeps>): DdevCertDeps {
  return { host: deps.host ?? createDdevHost(), run: deps.run ?? createLocalWpCertDeps().run }
}

/** `$(mkcert -CAROOT)/rootCA.pem`, or null when mkcert is missing or has no root yet. */
async function mkcertRootPath(deps: DdevCertDeps): Promise<string | null> {
  const mkcert = deps.host.findBinary('mkcert')
  if (!mkcert) {
    return null
  }
  const result = await deps.run(mkcert, ['-CAROOT'], VERIFY_TIMEOUT_MS)
  const directory = result.stdout.trim()
  if (result.code !== 0 || directory.length === 0) {
    return null
  }
  const rootPath = path.join(directory, 'rootCA.pem')
  return (await deps.host.pathExists(rootPath)) ? rootPath : null
}

/** A domain with DDEV's router port (`alchemy.ddev.site:8843`) is still one hostname to trust. */
function hostnameOf(domain: string): string {
  return domain.trim().replace(/:\d+$/, '')
}

export async function ddevCertStatus(
  domain: string,
  options: Partial<DdevCertDeps> = {}
): Promise<LocalWpCertStatus> {
  const deps = resolveDeps(options)
  const hostname = hostnameOf(domain)
  const base = { domain: hostname, certPath: '', exists: false, trusted: false }
  if (deps.host.platform !== 'darwin') {
    return { ...base, supported: false, reason: DDEV_CERT_UNSUPPORTED }
  }
  const rootPath = await mkcertRootPath(deps)
  if (!rootPath) {
    return { ...base, supported: false, reason: DDEV_MKCERT_MISSING }
  }
  // `-p basic` checks the chain only; a trusted self-signed root passes, an untrusted one exits 1.
  const verified = await deps.run(
    '/usr/bin/security',
    ['verify-cert', '-c', rootPath, '-p', 'basic'],
    VERIFY_TIMEOUT_MS
  )
  const trusted = verified.code === 0
  return {
    supported: true,
    domain: hostname,
    certPath: rootPath,
    exists: true,
    trusted,
    reason: trusted
      ? ''
      : `DDEV's local certificate authority is not trusted yet, so the browser will warn on https://${domain.trim()}.`
  }
}

export async function ddevCertTrust(
  domain: string,
  options: Partial<DdevCertDeps> = {}
): Promise<LocalWpCertTrustResult> {
  const deps = resolveDeps(options)
  const status = await ddevCertStatus(domain, deps)
  if (!status.supported) {
    return { ok: false, message: status.reason }
  }
  if (status.trusted) {
    return { ok: true, message: `HTTPS is already trusted for ${domain.trim()}.` }
  }
  const keychain = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db')
  // Without -p: a policy-restricted setting omits the result type and verify-cert keeps failing.
  const result = await deps.run(
    '/usr/bin/security',
    ['add-trusted-cert', '-r', 'trustRoot', '-k', keychain, status.certPath],
    TRUST_PROMPT_TIMEOUT_MS
  )
  if (result.code === 0) {
    return {
      ok: true,
      message: `Trusted DDEV's certificate authority. https://${domain.trim()} now loads without a warning.`
    }
  }
  if (result.timedOut) {
    return {
      ok: false,
      message:
        'macOS was still waiting for your password, so HTTPS is not trusted yet. Retry when you are ready.'
    }
  }
  return {
    ok: false,
    message: `macOS did not trust DDEV's certificate authority: ${result.stderr.trim() || `exit ${result.code}`}`
  }
}
