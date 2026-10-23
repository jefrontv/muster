import { describe, expect, it, vi } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import { readAgentLocalSuffix } from './agent-local-suffix'

function hostAnswering(response: AgentLocalResponse): AgentLocalHost {
  return { request: vi.fn(async () => response) } as unknown as AgentLocalHost
}

describe('readAgentLocalSuffix', () => {
  it('reads the suffix from GET /suffix', async () => {
    const host = hostAnswering({ ok: true, status: 200, data: { suffix: '.AL' } })
    await expect(readAgentLocalSuffix(host)).resolves.toBe('.al')
    expect(host.request).toHaveBeenCalledWith('GET', '/suffix')
  })

  it('returns null when the daemon is down or answers nonsense', async () => {
    await expect(
      readAgentLocalSuffix(hostAnswering({ ok: false, status: 0, error: 'down' }))
    ).resolves.toBeNull()
    await expect(
      readAgentLocalSuffix(hostAnswering({ ok: true, status: 200, data: { suffix: 'al; rm' } }))
    ).resolves.toBeNull()
  })
})
