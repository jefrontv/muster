import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteResult } from '../../shared/site-types'
import type {
  ActiveCollabMcpInstallResult,
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../shared/activecollab-mcp-types'

const { handlers, removed, statusMock, installMock, seedMock } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[],
  statusMock: vi.fn(),
  installMock: vi.fn(),
  seedMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel)
    })
  }
}))

// Why: the boundary under test is validation and result shaping. The writers have their own suite,
// and mocking them keeps this one from touching any config path at all.
vi.mock('../activecollab/mcp-install', () => ({
  getActiveCollabMcpStatus: statusMock,
  installActiveCollabMcpForAgents: installMock,
  seedActiveCollabMcpCredentials: seedMock
}))

import { registerActiveCollabMcpHandlers } from './activecollab-mcp'

const STATUS = { binary: { found: true } } as unknown as ActiveCollabMcpStatus
const INSTALLED = { results: [] } as unknown as ActiveCollabMcpInstallResult
const SEEDED: ActiveCollabMcpSeedResult = { seeded: false, reason: 'nothing to seed' }

function invoke<T>(channel: string, args?: unknown): SiteResult<T> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`channel ${channel} was never registered`)
  }
  return handler({}, args) as SiteResult<T>
}

function expectError<T>(result: SiteResult<T>): string {
  if (result.ok) {
    throw new Error('expected a failure result')
  }
  return result.error
}

beforeEach(() => {
  handlers.clear()
  removed.length = 0
  statusMock.mockReset()
  installMock.mockReset()
  seedMock.mockReset()
  statusMock.mockReturnValue(STATUS)
  installMock.mockReturnValue(INSTALLED)
  seedMock.mockReturnValue(SEEDED)
  registerActiveCollabMcpHandlers()
})

describe('registerActiveCollabMcpHandlers', () => {
  it('clears each channel before claiming it so a re-register cannot double up', () => {
    expect(removed).toEqual([
      'activecollabMcp:status',
      'activecollabMcp:install',
      'activecollabMcp:seedCredentials'
    ])
    expect([...handlers.keys()]).toEqual([
      'activecollabMcp:status',
      'activecollabMcp:install',
      'activecollabMcp:seedCredentials'
    ])
  })

  it('answers status with the tagged union rather than throwing across the bridge', () => {
    expect(invoke<ActiveCollabMcpStatus>('activecollabMcp:status')).toEqual({
      ok: true,
      value: STATUS
    })
  })

  it('reports a status failure as a value', () => {
    statusMock.mockImplementation(() => {
      throw new Error('userData unreadable')
    })

    expect(expectError(invoke('activecollabMcp:status'))).toBe('userData unreadable')
  })
})

describe('activecollabMcp:install validation', () => {
  it('passes through the known agent ids', () => {
    const result = invoke<ActiveCollabMcpInstallResult>('activecollabMcp:install', {
      agentIds: ['codex', 'cursor']
    })

    expect(result).toEqual({ ok: true, value: INSTALLED })
    expect(installMock).toHaveBeenCalledWith(['codex', 'cursor'])
  })

  it('collapses duplicates so one agent cannot be written twice', () => {
    invoke('activecollabMcp:install', { agentIds: ['codex', 'codex'] })

    expect(installMock).toHaveBeenCalledWith(['codex'])
  })

  it('rejects an unknown agent id at the boundary', () => {
    expect(expectError(invoke('activecollabMcp:install', { agentIds: ['vscode'] }))).toBe(
      'Unknown MCP agent id: vscode.'
    )
    expect(installMock).not.toHaveBeenCalled()
  })

  it('rejects a non-string agent id without stringifying a hostile value', () => {
    expect(expectError(invoke('activecollabMcp:install', { agentIds: [{ id: 'codex' }] }))).toBe(
      'Unknown MCP agent id: object.'
    )
    expect(installMock).not.toHaveBeenCalled()
  })

  it('rejects a missing or empty agent list', () => {
    for (const args of [undefined, {}, { agentIds: [] }, { agentIds: 'codex' }]) {
      expect(expectError(invoke('activecollabMcp:install', args))).toMatch(
        /requires a non-empty agentIds array/
      )
    }
    expect(installMock).not.toHaveBeenCalled()
  })

  it('rejects a list longer than the number of agents that exist', () => {
    expect(
      expectError(
        invoke('activecollabMcp:install', {
          agentIds: ['codex', 'codex', 'codex', 'codex']
        })
      )
    ).toMatch(/more agent ids than agents exist/)
    expect(installMock).not.toHaveBeenCalled()
  })

  it('reports a writer failure as a value', () => {
    installMock.mockImplementation(() => {
      throw new Error('home directory is read-only')
    })

    expect(expectError(invoke('activecollabMcp:install', { agentIds: ['codex'] }))).toBe(
      'home directory is read-only'
    )
  })
})

describe('activecollabMcp:seedCredentials', () => {
  it('returns the seed outcome, including the nothing-to-seed case', () => {
    expect(invoke<ActiveCollabMcpSeedResult>('activecollabMcp:seedCredentials')).toEqual({
      ok: true,
      value: SEEDED
    })
  })

  it('reports a keychain refusal as a failure the UI can show', () => {
    seedMock.mockImplementation(() => {
      throw new Error('ActiveCollab credential could not be read.')
    })

    expect(expectError(invoke('activecollabMcp:seedCredentials'))).toBe(
      'ActiveCollab credential could not be read.'
    )
  })
})
