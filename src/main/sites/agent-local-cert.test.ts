import { describe, expect, it, vi } from 'vitest'
import { agentLocalCertTrust } from './agent-local-cert'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'

const DOMAIN = 'flex.local'
const TRUST = `POST /certs/${DOMAIN}/trust`
const STATUS = `GET /certs/${DOMAIN}`
// What the daemon says when the one-time sudo allowlist was never installed.
const NEEDS_SUDO: AgentLocalResponse = {
  ok: false,
  status: 500,
  error:
    'trust failed (run `agent-local sudo` once to allow this without a prompt): needs root: security add-trusted-cert'
}

function host(
  routes: Record<string, AgentLocalResponse | AgentLocalResponse[]>
): AgentLocalHost & { calls: string[] } {
  const calls: string[] = []
  const queues = new Map(
    Object.entries(routes).map(([route, value]) => [
      route,
      Array.isArray(value) ? [...value] : [value]
    ])
  )
  const created = {
    platform: 'darwin',
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async (method: string, apiPath: string) => {
      const route = `${method} ${apiPath}`
      calls.push(route)
      const queue = queues.get(route)
      if (!queue || queue.length === 0) {
        return { ok: false, status: 404, error: 'not found' }
      }
      return queue.length > 1 ? (queue.shift() as AgentLocalResponse) : queue[0]!
    },
    spawnDaemon: async () => ({ kind: 'started' as const }),
    sleep: async () => undefined
  } as AgentLocalHost
  return Object.assign(created, { calls })
}

const trusted = { ok: true, status: 200, data: { exists: true, trusted: true } }
const untrusted = { ok: true, status: 200, data: { exists: true, trusted: false } }

describe('agentLocalCertTrust', () => {
  it('trusts through the daemon alone when the sudo allowlist lets it', async () => {
    const cli = vi.fn()
    const result = await agentLocalCertTrust(DOMAIN, {
      host: host({ [TRUST]: { ok: true, status: 200, data: trusted.data } }),
      runTrustCli: cli
    })
    expect(result.ok).toBe(true)
    expect(cli).not.toHaveBeenCalled()
  })

  it('falls back to the interactive CLI when the daemon needs a password prompt it cannot show', async () => {
    // The status read after the CLI ran is what decides success: the OS, not the CLI's word.
    const cli = vi.fn(async () => ({ code: 0, stdout: 'trusted', stderr: '', timedOut: false }))
    const h = host({ [TRUST]: NEEDS_SUDO, [STATUS]: trusted })
    const result = await agentLocalCertTrust(DOMAIN, { host: h, runTrustCli: cli })
    expect(cli).toHaveBeenCalledWith(DOMAIN)
    expect(result).toEqual({ ok: true, message: `Trusted ${DOMAIN}.` })
    // The first read only asks whether the CA needs the prompt; none reported on this daemon.
    expect(h.calls).toEqual([STATUS, TRUST, STATUS])
  })

  it('reports a cancelled prompt plainly instead of the daemon\u2019s sudo hint', async () => {
    const cli = vi.fn(async () => ({
      code: 1,
      stdout: '',
      stderr: 'authorization failed: exit status 1 User canceled. (-128)',
      timedOut: false
    }))
    const result = await agentLocalCertTrust(DOMAIN, {
      host: host({ [TRUST]: NEEDS_SUDO, [STATUS]: untrusted }),
      runTrustCli: cli
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      'The password prompt was cancelled, so the certificate is not trusted.'
    )
  })

  it('passes the CLI\u2019s own explanation through when it has one', async () => {
    // agent-local 0.23.4 explains a cancelled prompt itself; rewriting it would drop the detail.
    const cli = vi.fn(async () => ({
      code: 1,
      stdout: '',
      stderr:
        'error: the password prompt was cancelled or the keychain refused; flex.local.crt is still untrusted',
      timedOut: false
    }))
    const result = await agentLocalCertTrust(DOMAIN, {
      host: host({ [TRUST]: NEEDS_SUDO, [STATUS]: untrusted }),
      runTrustCli: cli
    })
    expect(result.message).toContain('flex.local.crt is still untrusted')
  })

  it('names the password dialog when the interactive CLI is killed still waiting for it', async () => {
    const cli = vi.fn(async () => ({ code: -1, stdout: '', stderr: '', timedOut: true }))
    const result = await agentLocalCertTrust(DOMAIN, {
      host: host({ [TRUST]: NEEDS_SUDO, [STATUS]: untrusted }),
      runTrustCli: cli
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS was still waiting for your password')
    expect(result.message).toContain(DOMAIN)
    // The control on the run screen, not the dead-end `agent-local sudo` hint the daemon sent.
    expect(result.message).toContain('Change and retry')
    expect(result.message).not.toContain('agent-local sudo')
  })

  it('does not claim success when the CLI exited 0 but the OS still reports untrusted', async () => {
    const cli = vi.fn(async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }))
    const result = await agentLocalCertTrust(DOMAIN, {
      host: host({ [TRUST]: NEEDS_SUDO, [STATUS]: untrusted }),
      runTrustCli: cli
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('agent-local sudo')
  })
})

describe('agentLocalCertTrust with a local CA (agent-local 0.36.0+)', () => {
  const caUntrusted: AgentLocalResponse = {
    ok: true,
    status: 200,
    data: { exists: true, trusted: false, ca: { trusted: false } }
  }
  const caTrusted: AgentLocalResponse = {
    ok: true,
    status: 200,
    data: { exists: true, trusted: true, ca: { trusted: true } }
  }

  it('goes straight to the prompt when the CA is not trusted yet', async () => {
    const machine = host({ [STATUS]: [caUntrusted, caTrusted] })
    const cli = vi.fn(async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }))

    const result = await agentLocalCertTrust(DOMAIN, { host: machine, runTrustCli: cli })

    expect(machine.calls).not.toContain(TRUST)
    expect(cli).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ ok: true })
    expect(result.message).toContain('certificate authority')
  })

  it('trusts through the daemon with no prompt once the CA is trusted', async () => {
    const machine = host({ [STATUS]: caTrusted, [TRUST]: caTrusted })
    const cli = vi.fn()

    const result = await agentLocalCertTrust(DOMAIN, { host: machine, runTrustCli: cli })

    expect(result).toEqual({ ok: true, message: `Trusted ${DOMAIN}.` })
    expect(cli).not.toHaveBeenCalled()
  })
})
