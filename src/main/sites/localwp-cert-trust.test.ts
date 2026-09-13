// Hermetic throughout: the command runner, the filesystem and the clock are injected, so no test
// here spawns `security`, reads a certificate, or touches the login keychain.

import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createLocalWpCertDeps,
  getLocalWpCertStatus,
  localWpCertPath,
  trustLocalWpCert,
  waitForLocalWpCert,
  type LocalWpCertCommandResult,
  type LocalWpCertDeps
} from './localwp-cert-trust'

const DOMAIN = '117pacific.local'
const CERT = localWpCertPath(DOMAIN)
const KEYCHAIN = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db')

const OK: LocalWpCertCommandResult = { code: 0, stdout: '', stderr: '', timedOut: false }

type RecordedCall = { file: string; args: string[]; timeoutMs: number }

function recorder(
  respond: (args: readonly string[]) => LocalWpCertCommandResult | Error = () => OK
): { run: LocalWpCertDeps['run']; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const run: LocalWpCertDeps['run'] = async (file, args, timeoutMs) => {
    calls.push({ file, args: [...args], timeoutMs })
    const outcome = respond(args)
    if (outcome instanceof Error) {
      throw outcome
    }
    return outcome
  }
  return { run, calls }
}

describe('getLocalWpCertStatus', () => {
  it('reports unsupported off darwin without spawning anything', async () => {
    const { run, calls } = recorder()

    const status = await getLocalWpCertStatus(DOMAIN, {
      platform: 'linux',
      run,
      fileExists: () => true
    })

    expect(status.supported).toBe(false)
    expect(status.exists).toBe(false)
    expect(status.trusted).toBe(false)
    expect(status.certPath).toBe('')
    expect(status.reason).toContain('macOS')
    expect(calls).toEqual([])
  })

  it('answers an empty domain from its own reason instead of probing the disk', async () => {
    const { run, calls } = recorder()
    const fileExists = vi.fn(() => true)

    const status = await getLocalWpCertStatus('   ', { platform: 'darwin', run, fileExists })

    expect(status).toEqual({
      supported: false,
      domain: '',
      certPath: '',
      exists: false,
      trusted: false,
      reason: expect.stringContaining('no local domain')
    })
    expect(fileExists).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('reports the certificate as missing without evaluating trust', async () => {
    const { run, calls } = recorder()

    const status = await getLocalWpCertStatus(DOMAIN, {
      platform: 'darwin',
      run,
      fileExists: () => false
    })

    expect(status.supported).toBe(true)
    expect(status.exists).toBe(false)
    expect(status.trusted).toBe(false)
    expect(status.certPath).toBe(CERT)
    // The common state right after a migration, so the reason has to read as the next step.
    expect(status.reason).toContain('Set up HTTPS')
    expect(calls).toEqual([])
  })

  it('reads trust from a zero exit of verify-cert', async () => {
    const { run, calls } = recorder()

    const status = await getLocalWpCertStatus(DOMAIN, {
      platform: 'darwin',
      run,
      fileExists: () => true
    })

    expect(status.exists).toBe(true)
    expect(status.trusted).toBe(true)
    expect(status.reason).toBe('')
    expect(calls).toEqual([
      { file: 'security', args: ['verify-cert', '-c', CERT], timeoutMs: 10_000 }
    ])
  })

  it('treats a nonzero verify-cert as untrusted and explains it', async () => {
    const { run } = recorder(() => ({
      code: 1,
      stdout: '',
      stderr: 'CSSMERR_TP_NOT_TRUSTED',
      timedOut: false
    }))

    const status = await getLocalWpCertStatus(DOMAIN, {
      platform: 'darwin',
      run,
      fileExists: () => true
    })

    expect(status.exists).toBe(true)
    expect(status.trusted).toBe(false)
    expect(status.reason).toContain(DOMAIN)
  })

  it('reports untrusted rather than throwing when the security binary is unavailable', async () => {
    const { run } = recorder(() => new Error('spawn security ENOENT'))

    const status = await getLocalWpCertStatus(DOMAIN, {
      platform: 'darwin',
      run,
      fileExists: () => true
    })

    expect(status.trusted).toBe(false)
    expect(status.exists).toBe(true)
  })

  it('gives every not-ready case a reason of its own, so the wizard never repeats', async () => {
    const { run } = recorder(() => ({ code: 1, stdout: '', stderr: '', timedOut: false }))
    const deps = { platform: 'darwin', run } satisfies Partial<LocalWpCertDeps>

    const reasons = [
      (await getLocalWpCertStatus(DOMAIN, { ...deps, platform: 'linux' })).reason,
      (await getLocalWpCertStatus('', deps)).reason,
      (await getLocalWpCertStatus(DOMAIN, { ...deps, fileExists: () => false })).reason,
      (await getLocalWpCertStatus(DOMAIN, { ...deps, fileExists: () => true })).reason
    ]

    expect(new Set(reasons).size).toBe(reasons.length)
    expect(reasons.every((reason) => reason.length > 0)).toBe(true)
  })
})

describe('waitForLocalWpCert', () => {
  it('resolves true when the certificate appears part-way through the poll', async () => {
    let clock = 0
    const sleeps: number[] = []
    const onStatus = vi.fn()
    let probes = 0

    const appeared = await waitForLocalWpCert(DOMAIN, {
      timeoutMs: 10_000,
      onStatus,
      deps: {
        platform: 'darwin',
        now: () => clock,
        sleep: async (ms) => {
          sleeps.push(ms)
          clock += ms
        },
        fileExists: () => {
          probes += 1
          return probes >= 3
        }
      }
    })

    expect(appeared).toBe(true)
    expect(sleeps).toEqual([1_000, 1_000])
    // Announced once, not once per second.
    expect(onStatus).toHaveBeenCalledTimes(1)
  })

  it('resolves false on timeout, which is the ordinary pre-HTTPS outcome', async () => {
    let clock = 0

    const appeared = await waitForLocalWpCert(DOMAIN, {
      timeoutMs: 3_000,
      deps: {
        platform: 'darwin',
        now: () => clock,
        sleep: async (ms) => {
          clock += ms
        },
        fileExists: () => false
      }
    })

    expect(appeared).toBe(false)
  })

  it('never waits off darwin', async () => {
    const sleep = vi.fn(async () => {})

    expect(
      await waitForLocalWpCert(DOMAIN, {
        deps: { platform: 'win32', sleep, fileExists: () => true }
      })
    ).toBe(false)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stops the poll on abort without spending the rest of the budget', async () => {
    let clock = 0
    const controller = new AbortController()
    let probes = 0

    const appeared = await waitForLocalWpCert(DOMAIN, {
      timeoutMs: 300_000,
      signal: controller.signal,
      deps: {
        platform: 'darwin',
        now: () => clock,
        sleep: async (ms) => {
          clock += ms
          // The user presses Cancel while LocalWP's router is still being asked.
          controller.abort()
        },
        fileExists: () => {
          probes += 1
          return false
        }
      }
    })

    expect(appeared).toBe(false)
    // One look, then the abort — not five minutes of polling.
    expect(probes).toBe(1)
    expect(clock).toBe(1_000)
  })
})

describe('trustLocalWpCert', () => {
  it('asks the user to start the site over HTTPS instead of spawning anything', async () => {
    const { run, calls } = recorder()

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => false }
    })

    expect(result).toEqual({
      ok: false,
      message: 'certificate not found — start the site over HTTPS, then retry'
    })
    expect(calls).toEqual([])
  })

  it('imports then adds a trustRoot setting, never restricting it to one policy', async () => {
    const { run, calls } = recorder()
    const onStatus = vi.fn()

    const result = await trustLocalWpCert(DOMAIN, {
      onStatus,
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result.ok).toBe(true)
    expect(result.message).toContain(DOMAIN)
    expect(calls.map((call) => call.args)).toEqual([
      ['import', CERT, '-k', KEYCHAIN],
      ['add-trusted-cert', '-r', 'trustRoot', '-k', KEYCHAIN, CERT]
    ])
    // -p would omit the Result Type and leave the trust silently incomplete.
    expect(calls[1]?.args).not.toContain('-p')
    expect(onStatus).toHaveBeenCalledTimes(1)
  })

  it('carries on when import fails, since import says nothing about trust', async () => {
    const { run, calls } = recorder((args) =>
      args[0] === 'import' ? { code: 1, stdout: '', stderr: 'already exists', timedOut: false } : OK
    )

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result.ok).toBe(true)
    expect(calls.map((call) => call.args[0])).toEqual(['import', 'add-trusted-cert'])
  })

  it('carries on when import throws outright', async () => {
    const { run, calls } = recorder((args) =>
      args[0] === 'import' ? new Error('spawn security ENOENT') : OK
    )

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('gives the interactive trust call a human-scale budget and the keychain import a machine one', async () => {
    const { run, calls } = recorder()

    await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    // add-trusted-cert is gated by a macOS authentication dialog, so it gets five minutes to be
    // answered; import has no human in it and keeps the 30s keychain budget.
    expect(calls.map((call) => ({ op: call.args[0], timeoutMs: call.timeoutMs }))).toEqual([
      { op: 'import', timeoutMs: 30_000 },
      { op: 'add-trusted-cert', timeoutMs: 300_000 }
    ])
  })

  it('marks a child killed by its deadline as timedOut, not as a refusal', async () => {
    // The real runner, not an injected fake, and a real child that never finishes: a SIGTERM to a
    // live process is the behaviour under test, which fake timers cannot produce. The budget is what
    // is asserted, so the wait is ~50ms rather than any duration the test guesses at.
    const { run } = createLocalWpCertDeps()

    const result = await run(process.execPath, ['-e', 'process.stdin.resume()'], 50)

    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
  })

  it('names the password dialog, not the deadline, when the trust write is killed waiting', async () => {
    const { run, calls } = recorder((args) =>
      args[0] === 'add-trusted-cert'
        ? { code: 1, stdout: '', stderr: 'security timed out after 300000ms', timedOut: true }
        : OK
    )

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS was still waiting for your password')
    expect(result.message).toContain(DOMAIN)
    // The run screen's own control, so the sentence tells the user what to press.
    expect(result.message).toContain('Change and retry')
    expect(result.message).not.toContain('timed out')
    expect(calls.map((call) => call.args[0])).toEqual([
      'import',
      'add-trusted-cert',
      'find-certificate'
    ])
  })

  it('surfaces the first stderr line when add-trusted-cert fails', async () => {
    const { run } = recorder((args) =>
      args[0] === 'add-trusted-cert'
        ? {
            code: 1,
            stdout: '',
            stderr:
              'SecTrustSettingsSetTrustSettings: The authorization was denied.\ntrailing noise\n',
            timedOut: false
          }
        : OK
    )

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result).toEqual({
      ok: false,
      message:
        'trust failed: SecTrustSettingsSetTrustSettings: The authorization was denied. — ' +
        'The certificate itself is already in your keychain; only the trust setting is missing.'
    })
  })

  it('tells a certificate that never reached the keychain apart from an untrusted one', async () => {
    const { run } = recorder((args) => {
      // import failed and find-certificate cannot see the item either: the item is absent, which is
      // a different problem from the one the sentence above describes.
      if (args[0] === 'add-trusted-cert') {
        return { code: 1, stdout: '', stderr: 'SecTrustSettings…', timedOut: false }
      }
      return { code: 1, stdout: '', stderr: '', timedOut: false }
    })

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'darwin', run, fileExists: () => true }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('did not reach your keychain')
    expect(result.message).not.toContain('already in your keychain')
  })

  it('refuses off darwin without spawning anything', async () => {
    const { run, calls } = recorder()

    const result = await trustLocalWpCert(DOMAIN, {
      deps: { platform: 'linux', run, fileExists: () => true }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS')
    expect(calls).toEqual([])
  })
})
