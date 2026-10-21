// Muster's own signing certificate for LocalWP sites: created once, trusted once in the System
// keychain, and used to sign each site's certificate. LocalWP's own certificates are self-signed per
// site, so without a shared signer every site needs its own trust write.
//
// Name-constrained to .local, .test and .localhost: a leaked key can never sign for a real domain.
// See docs/muster/2026-10-22-localwp-signing-cert-plan.md for the macOS 26 findings behind the flow.

import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLocalWpCertDeps, type LocalWpCertDeps } from './localwp-cert-trust'

const OPENSSL_BINARY = '/usr/bin/openssl'
const SECURITY_BINARY = '/usr/bin/security'
export const SYSTEM_KEYCHAIN = '/Library/Keychains/System.keychain'

const OPENSSL_TIMEOUT_MS = 30_000
const KEYCHAIN_READ_TIMEOUT_MS = 30_000
const SIGNING_CERT_DAYS = 3650
/** Apple rejects TLS server certificates valid for longer than this, whatever signed them. */
const SITE_CERT_DAYS = 825

export const SIGNING_CERT_SUFFIXES: readonly string[] = ['local', 'test', 'localhost']

// The domain lands in openssl config files, so anything outside hostname characters is refused.
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export type SigningCertFiles = {
  writeText: (filePath: string, contents: string) => Promise<void>
  copy: (from: string, to: string) => Promise<void>
  makePrivateDir: (dirPath: string) => Promise<void>
  makePrivate: (filePath: string) => Promise<void>
  remove: (filePath: string) => Promise<void>
}

export type SigningCertDeps = LocalWpCertDeps & { files: SigningCertFiles }

export function createSigningCertDeps(
  overrides: Partial<Omit<SigningCertDeps, 'files'>> & { files?: Partial<SigningCertFiles> } = {}
): SigningCertDeps {
  const { files, ...rest } = overrides
  return {
    ...createLocalWpCertDeps(rest),
    files: {
      writeText: (filePath, contents) => writeFile(filePath, contents, 'utf8'),
      copy: (from, to) => copyFile(from, to),
      makePrivateDir: async (dirPath) => {
        await mkdir(dirPath, { recursive: true, mode: 0o700 })
      },
      makePrivate: (filePath) => chmod(filePath, 0o600),
      remove: (filePath) => rm(filePath, { force: true }),
      ...files
    }
  }
}

export type SigningCertPaths = {
  dir: string
  certPath: string
  keyPath: string
  /** Shown in Keychain Access; dev builds keep their own so a dev run never touches the real one. */
  name: string
}

export function signingCertPaths(userDataPath: string): SigningCertPaths {
  const dir = path.join(userDataPath, 'localwp-signing-cert')
  const dev = path.basename(userDataPath).endsWith('-dev')
  return {
    dir,
    certPath: path.join(dir, 'muster-local-sites.crt'),
    keyPath: path.join(dir, 'muster-local-sites.key'),
    name: dev ? 'Muster Local Sites (dev)' : 'Muster Local Sites'
  }
}

/** Where a site's Muster-signed pair is kept, so a retry reuses it instead of minting another. */
export function stagedSiteCertPaths(
  paths: SigningCertPaths,
  domain: string
): { certPath: string; keyPath: string } {
  return {
    certPath: path.join(paths.dir, 'sites', `${domain}.crt`),
    keyPath: path.join(paths.dir, 'sites', `${domain}.key`)
  }
}

export function canSignForDomain(domain: string): boolean {
  if (!HOSTNAME_PATTERN.test(domain)) {
    return false
  }
  return SIGNING_CERT_SUFFIXES.includes(domain.toLowerCase().split('.').at(-1) ?? '')
}

export type SigningOutcome = { ok: true } | { ok: false; message: string }

/** First line of whatever the command printed, so the log shows macOS's own words. */
export function commandDetail(result: { stdout: string; stderr: string }): string {
  return (result.stderr.trim() || result.stdout.trim()).split('\n')[0]?.trim() || 'unknown error'
}

async function runOpenssl(
  args: string[],
  what: string,
  deps: SigningCertDeps
): Promise<SigningOutcome> {
  const result = await deps.run(OPENSSL_BINARY, args, OPENSSL_TIMEOUT_MS)
  return result.code === 0
    ? { ok: true }
    : { ok: false, message: `${what} failed: ${commandDetail(result)}` }
}

function signingCertConfig(name: string): string {
  return [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = ca_ext',
    'prompt = no',
    '[dn]',
    `CN = ${name}`,
    '[ca_ext]',
    'basicConstraints = critical,CA:TRUE,pathlen:0',
    'keyUsage = critical,keyCertSign,cRLSign',
    'subjectKeyIdentifier = hash',
    `nameConstraints = critical,${SIGNING_CERT_SUFFIXES.map((suffix) => `permitted;DNS:${suffix}`).join(',')}`,
    ''
  ].join('\n')
}

function siteCertExtensions(domain: string): string {
  return [
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth',
    `subjectAltName = DNS:${domain},DNS:*.${domain}`,
    'authorityKeyIdentifier = keyid',
    ''
  ].join('\n')
}

/** Creates the signing certificate when it is not on disk yet; `created` says which happened. */
export async function ensureSigningCert(
  paths: SigningCertPaths,
  deps: SigningCertDeps
): Promise<SigningOutcome & { created?: boolean }> {
  if (deps.fileExists(paths.certPath) && deps.fileExists(paths.keyPath)) {
    return { ok: true, created: false }
  }
  await deps.files.makePrivateDir(paths.dir)
  const configPath = path.join(paths.dir, 'signing-cert.cnf')
  await deps.files.writeText(configPath, signingCertConfig(paths.name))
  // -nodes: Muster signs unattended, so the key cannot sit behind a passphrase; the 0700 dir and
  // 0600 key are its protection, with the name constraints bounding what a leak could sign.
  const created = await runOpenssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      String(SIGNING_CERT_DAYS),
      '-keyout',
      paths.keyPath,
      '-out',
      paths.certPath,
      '-config',
      configPath
    ],
    "Creating Muster's signing certificate",
    deps
  )
  await deps.files.remove(configPath)
  if (!created.ok) {
    return created
  }
  await deps.files.makePrivate(paths.keyPath)
  return { ok: true, created: true }
}

/** Signs a certificate for `domain`, reusing the staged pair from an earlier run when present. */
export async function ensureSiteCert(
  domain: string,
  paths: SigningCertPaths,
  deps: SigningCertDeps
): Promise<SigningOutcome & { certPath?: string; keyPath?: string }> {
  const staged = stagedSiteCertPaths(paths, domain)
  if (deps.fileExists(staged.certPath) && deps.fileExists(staged.keyPath)) {
    return { ok: true, ...staged }
  }
  await deps.files.makePrivateDir(path.dirname(staged.certPath))
  const requestPath = `${staged.certPath}.csr`
  const extensionsPath = `${staged.certPath}.ext`
  await deps.files.writeText(extensionsPath, siteCertExtensions(domain))
  const requested = await runOpenssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      staged.keyPath,
      '-out',
      requestPath,
      '-subj',
      `/CN=${domain}`
    ],
    `Creating a key for ${domain}`,
    deps
  )
  const signed = requested.ok
    ? await runOpenssl(
        [
          'x509',
          '-req',
          '-sha256',
          '-in',
          requestPath,
          '-CA',
          paths.certPath,
          '-CAkey',
          paths.keyPath,
          '-set_serial',
          `0x${randomBytes(16).toString('hex')}`,
          '-days',
          String(SITE_CERT_DAYS),
          '-extfile',
          extensionsPath,
          '-out',
          staged.certPath
        ],
        `Signing the ${domain} certificate`,
        deps
      )
    : requested
  await deps.files.remove(requestPath)
  await deps.files.remove(extensionsPath)
  if (!signed.ok) {
    // A key without its certificate would be reused by the next run as if it were a pair.
    await deps.files.remove(staged.keyPath)
    return signed
  }
  await deps.files.makePrivate(staged.keyPath)
  return { ok: true, ...staged }
}

/** Uppercase hex SHA-256 with no separators, the form `security find-certificate -Z` prints. */
export async function certFingerprint(
  certPath: string,
  deps: SigningCertDeps
): Promise<string | null> {
  const result = await deps.run(
    OPENSSL_BINARY,
    ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256'],
    OPENSSL_TIMEOUT_MS
  )
  const value = result.code === 0 ? result.stdout.split('=')[1] : undefined
  return value ? value.replace(/[^0-9a-f]/gi, '').toUpperCase() : null
}

/** The exact check LocalWP's Trust button makes: is this certificate in the System keychain. */
export async function isInSystemKeychain(
  fingerprint: string,
  deps: SigningCertDeps
): Promise<boolean> {
  const result = await deps.run(
    SECURITY_BINARY,
    ['find-certificate', '-a', '-Z', SYSTEM_KEYCHAIN],
    KEYCHAIN_READ_TIMEOUT_MS
  )
  return result.code === 0 && new RegExp(`^SHA-256 hash: ${fingerprint}$`, 'im').test(result.stdout)
}
