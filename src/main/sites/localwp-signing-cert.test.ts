import { describe, expect, it } from 'vitest'
import type { LocalWpCertCommandResult } from './localwp-cert-trust'
import {
  canSignForDomain,
  certFingerprint,
  createSigningCertDeps,
  ensureSigningCert,
  ensureSiteCert,
  isInSystemKeychain,
  signingCertPaths,
  stagedSiteCertPaths,
  type SigningCertDeps
} from './localwp-signing-cert'

type Call = { file: string; args: readonly string[] }

function harness(
  options: {
    existing?: string[]
    respond?: (call: Call) => Partial<LocalWpCertCommandResult>
  } = {}
): { deps: SigningCertDeps; calls: Call[]; files: Map<string, string>; privateFiles: string[] } {
  const calls: Call[] = []
  const files = new Map<string, string>((options.existing ?? []).map((file) => [file, '']))
  const privateFiles: string[] = []
  const deps = createSigningCertDeps({
    platform: 'darwin',
    run: async (file, args) => {
      calls.push({ file, args })
      return {
        code: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        ...options.respond?.({ file, args })
      }
    },
    fileExists: (filePath) => files.has(filePath),
    sleep: async () => undefined,
    now: () => 0,
    files: {
      writeText: async (filePath, contents) => {
        files.set(filePath, contents)
      },
      copy: async (from, to) => {
        files.set(to, files.get(from) ?? '')
      },
      makePrivateDir: async () => undefined,
      makePrivate: async (filePath) => {
        privateFiles.push(filePath)
      },
      remove: async (filePath) => {
        files.delete(filePath)
      }
    }
  })
  return { deps, calls, files, privateFiles }
}

const PATHS = signingCertPaths('/data/muster-dev')

describe('canSignForDomain', () => {
  it('accepts only the name-constrained suffixes', () => {
    expect(canSignForDomain('acme.local')).toBe(true)
    expect(canSignForDomain('shop.acme.test')).toBe(true)
    expect(canSignForDomain('acme.localhost')).toBe(true)
    expect(canSignForDomain('acme.com')).toBe(false)
    expect(canSignForDomain('local')).toBe(false)
  })

  it('refuses anything that is not a hostname, since it lands in openssl config files', () => {
    expect(canSignForDomain('acme.local\nCN = evil')).toBe(false)
    expect(canSignForDomain('ac me.local')).toBe(false)
  })
})

describe('signingCertPaths', () => {
  it('names the dev signer apart from the real one', () => {
    expect(signingCertPaths('/data/muster-dev').name).toBe('Muster Local Sites (dev)')
    expect(signingCertPaths('/data/Muster').name).toBe('Muster Local Sites')
  })
})

describe('ensureSigningCert', () => {
  it('reuses a signer already on disk without running openssl', async () => {
    const { deps, calls } = harness({ existing: [PATHS.certPath, PATHS.keyPath] })
    expect(await ensureSigningCert(PATHS, deps)).toEqual({ ok: true, created: false })
    expect(calls).toEqual([])
  })

  it('creates a name-constrained signer and locks its key down', async () => {
    let config = ''
    const { deps, calls, files, privateFiles } = harness({
      respond: (call) => {
        const configPath = call.args[call.args.indexOf('-config') + 1] ?? ''
        config = files.get(configPath) ?? ''
        return {}
      }
    })
    expect(await ensureSigningCert(PATHS, deps)).toEqual({ ok: true, created: true })
    expect(calls[0]?.file).toBe('/usr/bin/openssl')
    expect(calls[0]?.args.slice(0, 2)).toEqual(['req', '-x509'])
    expect(config).toContain('CN = Muster Local Sites (dev)')
    expect(config).toContain(
      'nameConstraints = critical,permitted;DNS:local,permitted;DNS:test,permitted;DNS:localhost'
    )
    expect(privateFiles).toEqual([PATHS.keyPath])
    expect([...files.keys()].some((file) => file.endsWith('.cnf'))).toBe(false)
  })

  it("reports openssl's own words when creation fails", async () => {
    const { deps, privateFiles } = harness({
      respond: () => ({ code: 1, stderr: 'unknown option -addext\nusage: req' })
    })
    expect(await ensureSigningCert(PATHS, deps)).toEqual({
      ok: false,
      message: "Creating Muster's signing certificate failed: unknown option -addext"
    })
    expect(privateFiles).toEqual([])
  })
})

describe('ensureSiteCert', () => {
  const staged = stagedSiteCertPaths(PATHS, 'acme.local')

  it('reuses the staged pair so a retry adds no new System keychain item', async () => {
    const { deps, calls } = harness({ existing: [staged.certPath, staged.keyPath] })
    expect(await ensureSiteCert('acme.local', PATHS, deps)).toEqual({ ok: true, ...staged })
    expect(calls).toEqual([])
  })

  it('signs for the domain and its subdomains within the 825-day limit', async () => {
    let extensions = ''
    const { deps, calls, files } = harness({
      respond: (call) => {
        if (call.args[0] === 'x509') {
          extensions = files.get(call.args[call.args.indexOf('-extfile') + 1] ?? '') ?? ''
        }
        return {}
      }
    })
    expect(await ensureSiteCert('acme.local', PATHS, deps)).toEqual({ ok: true, ...staged })
    const signing = calls.find((call) => call.args[0] === 'x509')?.args ?? []
    expect(signing[signing.indexOf('-CA') + 1]).toBe(PATHS.certPath)
    expect(signing[signing.indexOf('-days') + 1]).toBe('825')
    expect(extensions).toContain('subjectAltName = DNS:acme.local,DNS:*.acme.local')
    expect(extensions).toContain('extendedKeyUsage = serverAuth')
  })

  it('drops the new key when signing fails, so it is never reused without a certificate', async () => {
    const { deps, files } = harness({
      respond: (call) => {
        if (call.args[0] === 'req') {
          files.set(staged.keyPath, 'key')
        }
        return call.args[0] === 'x509' ? { code: 1, stderr: 'unable to load CA private key' } : {}
      }
    })
    expect(await ensureSiteCert('acme.local', PATHS, deps)).toEqual({
      ok: false,
      message: 'Signing the acme.local certificate failed: unable to load CA private key'
    })
    expect(files.has(staged.keyPath)).toBe(false)
  })
})

describe('certFingerprint and isInSystemKeychain', () => {
  it('normalises the openssl fingerprint to the form find-certificate prints', async () => {
    const { deps } = harness({
      respond: () => ({ stdout: 'SHA256 Fingerprint=b5:f0:67:24\n' })
    })
    expect(await certFingerprint('/c.crt', deps)).toBe('B5F06724')
  })

  it('matches a whole SHA-256 line in the System keychain listing', async () => {
    const { deps, calls } = harness({
      respond: () => ({ stdout: 'SHA-1 hash: 00\nSHA-256 hash: B5F06724\n' })
    })
    expect(await isInSystemKeychain('B5F06724', deps)).toBe(true)
    expect(await isInSystemKeychain('B5F067', deps)).toBe(false)
    expect(calls[0]?.args).toEqual([
      'find-certificate',
      '-a',
      '-Z',
      '/Library/Keychains/System.keychain'
    ])
  })
})
