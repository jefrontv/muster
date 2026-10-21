import { describe, expect, it, vi } from 'vitest'
import { localWpCertPath, type LocalWpCertCommandResult } from './localwp-cert-trust'
import {
  createSigningCertDeps,
  signingCertPaths,
  stagedSiteCertPaths
} from './localwp-signing-cert'
import {
  installSigningCertForLocalWpSite,
  type SigningInstallDeps
} from './localwp-signing-cert-install'

const DOMAIN = 'acme.local'
const USER_DATA = '/data/muster-dev'
const PATHS = signingCertPaths(USER_DATA)
const STAGED = stagedSiteCertPaths(PATHS, DOMAIN)
const LOCAL_CERT = localWpCertPath(DOMAIN)
const LOCAL_KEY = LOCAL_CERT.replace(/\.crt$/, '.key')
const FINGERPRINTS: Record<string, string> = { [PATHS.certPath]: 'AAAA', [STAGED.certPath]: 'BBBB' }

type World = {
  systemKeychain: Set<string>
  trusted: Set<string>
  files: Map<string, string>
  calls: { file: string; args: readonly string[] }[]
  restarts: number
  served: string | null
  adminResult?: Partial<LocalWpCertCommandResult>
}

function harness(world: Partial<World> = {}): { state: World; deps: Partial<SigningInstallDeps> } {
  const state: World = {
    systemKeychain: new Set(),
    trusted: new Set(),
    files: new Map([
      [LOCAL_CERT, 'local-crt'],
      [LOCAL_KEY, 'local-key']
    ]),
    calls: [],
    restarts: 0,
    served: 'BBBB',
    ...world
  }
  const run = async (file: string, args: readonly string[]): Promise<LocalWpCertCommandResult> => {
    state.calls.push({ file, args })
    const ok = { code: 0, stdout: '', stderr: '', timedOut: false }
    const target = args.at(-1) ?? ''
    if (args[0] === 'req') {
      const out = args[args.indexOf(args[1] === '-x509' ? '-out' : '-keyout') + 1] ?? ''
      state.files.set(out, 'x')
      state.files.set(args[1] === '-x509' ? PATHS.keyPath : STAGED.keyPath, 'key')
      return ok
    }
    if (args[0] === 'x509' && args.includes('-req')) {
      state.files.set(STAGED.certPath, 'site-crt')
      return ok
    }
    if (args[0] === 'x509') {
      const fingerprint = FINGERPRINTS[args[args.indexOf('-in') + 1] ?? ''] ?? 'LOCAL'
      return { ...ok, stdout: `SHA256 Fingerprint=${fingerprint}` }
    }
    if (args[0] === 'find-certificate') {
      return {
        ...ok,
        stdout: [...state.systemKeychain].map((fp) => `SHA-256 hash: ${fp}`).join('\n')
      }
    }
    if (file === 'osascript') {
      if (state.adminResult) {
        return { ...ok, ...state.adminResult }
      }
      Object.entries(FINGERPRINTS).forEach(([path, fp]) => {
        if (args[1]?.includes(path)) {
          state.systemKeychain.add(fp)
        }
      })
      return ok
    }
    if (args[0] === 'add-trusted-cert') {
      state.trusted.add(target)
      return ok
    }
    if (args[0] === 'verify-cert') {
      const cert = args[2] ?? ''
      const chained = cert === LOCAL_CERT && state.files.get(LOCAL_CERT) === 'site-crt'
      return state.trusted.has(cert) || (chained && state.trusted.has(PATHS.certPath))
        ? ok
        : { ...ok, code: 1 }
    }
    return ok
  }
  const deps: Partial<SigningInstallDeps> = {
    userDataPath: () => USER_DATA,
    cert: createSigningCertDeps({
      platform: 'darwin',
      run,
      fileExists: (filePath) => state.files.has(filePath),
      sleep: async () => undefined,
      now: (() => {
        let clock = 0
        return () => (clock += 5_000)
      })(),
      files: {
        writeText: async (filePath, contents) => {
          state.files.set(filePath, contents)
        },
        copy: async (from, to) => {
          state.files.set(to, state.files.get(from) ?? '')
        },
        makePrivateDir: async () => undefined,
        makePrivate: async () => undefined,
        remove: async (filePath) => {
          state.files.delete(filePath)
        }
      }
    }),
    restartSite: async () => {
      state.restarts += 1
      return { ok: true, message: 'LocalWP site started' }
    },
    servedFingerprint: async () => state.served
  }
  return { state, deps }
}

describe('installSigningCertForLocalWpSite', () => {
  it('adds both certificates as root, trusts the signer as the user, then swaps and restarts', async () => {
    const { state, deps } = harness()
    const result = await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', { deps })

    expect(result.ok).toBe(true)
    expect(result.message).toContain('LocalWP shows the certificate as trusted')
    const admin = state.calls.find((call) => call.file === 'osascript')?.args[1] ?? ''
    expect(admin).toContain('with administrator privileges')
    expect(admin).toContain('add-certificates -k /Library/Keychains/System.keychain')
    expect(state.calls.find((call) => call.args[0] === 'add-trusted-cert')?.args).toEqual([
      'add-trusted-cert',
      '-d',
      '-r',
      'trustRoot',
      PATHS.certPath
    ])
    expect(state.files.get(`${LOCAL_CERT}.local-original`)).toBe('local-crt')
    expect(state.files.get(LOCAL_CERT)).toBe('site-crt')
    expect(state.restarts).toBe(1)
  })

  it('asks for nothing when the signer is trusted and both certificates are already present', async () => {
    const { state, deps } = harness({
      systemKeychain: new Set(['AAAA', 'BBBB']),
      trusted: new Set([PATHS.certPath])
    })
    expect((await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', { deps })).ok).toBe(true)
    expect(state.calls.some((call) => call.file === 'osascript')).toBe(false)
    expect(state.calls.some((call) => call.args[0] === 'add-trusted-cert')).toBe(false)
  })

  it('refuses a domain outside the name constraints before touching anything', async () => {
    const { state, deps } = harness()
    const result = await installSigningCertForLocalWpSite('acme.com', '/sites/acme', { deps })
    expect(result).toEqual({
      ok: false,
      message: 'acme.com does not end in .local, .test, .localhost.'
    })
    expect(state.calls).toEqual([])
  })

  it("passes the admin dialog's error through and leaves Local's files alone", async () => {
    const { state, deps } = harness({
      adminResult: { code: 1, stderr: '0:200: execution error: User canceled. (-128)' }
    })
    const result = await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', { deps })
    expect(result).toEqual({
      ok: false,
      message: 'System keychain write failed: 0:200: execution error: User canceled. (-128)'
    })
    expect(state.files.get(LOCAL_CERT)).toBe('local-crt')
    expect(state.restarts).toBe(0)
  })

  it("restores Local's own pair when the router keeps serving the old certificate", async () => {
    const { state, deps } = harness({ served: 'LOCAL' })
    const result = await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', { deps })
    expect(result).toEqual({
      ok: false,
      message:
        "LocalWP is still serving its own certificate for acme.local. Restored LocalWP's own certificate."
    })
    expect(state.files.get(LOCAL_CERT)).toBe('local-crt')
    expect(state.files.get(LOCAL_KEY)).toBe('local-key')
    expect(state.restarts).toBe(2)
  })

  it("keeps the first backup on a rerun, so Local's original is never overwritten", async () => {
    const { state, deps } = harness()
    await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', { deps })
    const copy = vi.fn()
    await installSigningCertForLocalWpSite(DOMAIN, '/sites/acme', {
      deps: { ...deps, restartSite: async () => (copy(), { ok: true, message: '' }) }
    })
    expect(state.files.get(`${LOCAL_CERT}.local-original`)).toBe('local-crt')
    expect(copy).toHaveBeenCalledOnce()
  })
})
