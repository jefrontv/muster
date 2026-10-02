import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteResult } from '../../shared/site-types'
import type {
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../shared/activecollab-mcp-types'

const { handlers, removed, statusMock, seedMock } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[],
  statusMock: vi.fn(),
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
  seedActiveCollabMcpCredentials: seedMock
}))

import { registerActiveCollabMcpHandlers } from './activecollab-mcp'

const STATUS = { binary: { found: true } } as unknown as ActiveCollabMcpStatus
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
  seedMock.mockReset()
  statusMock.mockReturnValue(STATUS)
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
    // The retired per-agent install is cleared but never answered again.
    expect([...handlers.keys()]).toEqual([
      'activecollabMcp:status',
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
