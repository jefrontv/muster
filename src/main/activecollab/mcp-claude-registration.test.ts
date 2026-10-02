import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionHarnessState } from '../../shared/extension-state-types'
import type { Store } from '../persistence'

const { inventoryMock, installMock } = vi.hoisted(() => ({
  inventoryMock: vi.fn(),
  installMock: vi.fn()
}))

vi.mock('../extensions/extension-service', () => ({
  readExtensionInventory: inventoryMock,
  installExtensionHarness: installMock,
  findCatalogEntry: (inventory: { entries: { entry: { id: string } }[] }, id: string) =>
    inventory.entries.find(({ entry }) => entry.id === id)?.entry ?? null
}))

import { registerActiveCollabMcpWithClaude } from './mcp-claude-registration'

const store = {} as Store

function claude(overrides: Partial<ExtensionHarnessState>): ExtensionHarnessState {
  return {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: '/home/.claude.json',
    present: true,
    configured: false,
    current: false,
    ...overrides
  }
}

function withClaude(harness: ExtensionHarnessState | null): void {
  inventoryMock.mockResolvedValue({
    entries: [
      {
        entry: { id: 'activecollab-mcp' },
        state: { harnesses: harness ? [harness] : [] }
      }
    ]
  })
}

beforeEach(() => {
  inventoryMock.mockReset()
  installMock.mockReset()
})

describe('registerActiveCollabMcpWithClaude', () => {
  it('registers through the hub when Claude Code is present without an entry', async () => {
    withClaude(claude({}))
    await registerActiveCollabMcpWithClaude(store)
    expect(installMock).toHaveBeenCalledWith(store, { id: 'activecollab-mcp' }, 'claude-code')
  })

  it('leaves a current entry alone', async () => {
    withClaude(claude({ configured: true, current: true }))
    await registerActiveCollabMcpWithClaude(store)
    expect(installMock).not.toHaveBeenCalled()
  })

  it('does not create a Claude config on a machine without Claude Code', async () => {
    withClaude(claude({ present: false }))
    await registerActiveCollabMcpWithClaude(store)
    expect(installMock).not.toHaveBeenCalled()
  })
})
