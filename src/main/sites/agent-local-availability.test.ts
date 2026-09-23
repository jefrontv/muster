// The probe that decides whether agent-local is offered as an option.
//
// It changed shape deliberately: the renderer now re-runs it on focus and on a timer, and the old
// body called `requestWithDaemon`, which *starts* the daemon when it is down — a `restart-daemon`
// allowed to take a minute. Worth a probe that cannot boot a service, so the whole file is about
// what it does and does not touch.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as agentLocalHostModule from './agent-local-host'

const harness = vi.hoisted(() => ({
  platform: 'darwin',
  readToken: vi.fn(),
  request: vi.fn(),
  onPath: vi.fn(),
  binFolder: vi.fn()
}))

vi.mock('./agent-local-host', async (importOriginal) => ({
  ...(await importOriginal<typeof agentLocalHostModule>()),
  createAgentLocalHost: () => ({
    platform: harness.platform,
    homeDir: '/home/test',
    readToken: harness.readToken,
    request: harness.request,
    spawnDaemon: async () => ({ kind: 'started' as const }),
    sleep: async () => undefined
  })
}))

vi.mock('../ipc/preflight-command-exec', () => ({ isCommandOnPath: harness.onPath }))
vi.mock('../extensions/binary-probe', () => ({
  probeBinary: () => ({ found: harness.binFolder() === true })
}))

import { agentLocalProvider } from './agent-local-site-control'

describe('agentLocalProvider.isAvailable', () => {
  beforeEach(() => {
    harness.platform = 'darwin'
    harness.readToken.mockReset()
    harness.request.mockReset()
    harness.onPath.mockReset()
    harness.binFolder.mockReset()
  })

  it('does not offer a leftover token with no binary, and never asks the daemon', async () => {
    harness.readToken.mockResolvedValue('token')
    harness.onPath.mockResolvedValue(false)
    // Reaching the daemon is the bug: this probe is re-run on a timer.
    harness.request.mockResolvedValue({ ok: true, status: 200 })

    await expect(agentLocalProvider.isAvailable()).resolves.toBe(false)
    expect(harness.request).not.toHaveBeenCalled()
  })

  it('offers an install in a bin folder the GUI PATH lacks', async () => {
    harness.onPath.mockResolvedValue(false)
    harness.binFolder.mockReturnValue(true)

    await expect(agentLocalProvider.isAvailable()).resolves.toBe(true)
  })

  it('offers a fresh install that has never run, when the binary is on PATH', async () => {
    harness.readToken.mockResolvedValue(null)
    harness.onPath.mockResolvedValue(true)

    await expect(agentLocalProvider.isAvailable()).resolves.toBe(true)
  })

  it('hides the option when there is neither a token nor a binary', async () => {
    harness.readToken.mockResolvedValue(null)
    harness.onPath.mockResolvedValue(false)

    await expect(agentLocalProvider.isAvailable()).resolves.toBe(false)
  })

  it('hides the option off macOS, whatever is installed', async () => {
    harness.platform = 'linux'
    harness.readToken.mockResolvedValue('token')

    await expect(agentLocalProvider.isAvailable()).resolves.toBe(false)
  })
})
