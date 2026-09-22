import { beforeEach, describe, expect, it, vi } from 'vitest'

const trashItemMock = vi.fn()
vi.mock('electron', () => ({ shell: { trashItem: (path: string) => trashItemMock(path) } }))

const readExtensionInventoryMock = vi.fn()
const installExtensionHarnessMock = vi.fn()
const uninstallExtensionMcpHarnessMock = vi.fn()

vi.mock('./extension-service', () => ({
  readExtensionInventory: () => readExtensionInventoryMock(),
  installExtensionHarness: (...args: unknown[]) => installExtensionHarnessMock(...args)
}))
vi.mock('./mcp-entry-adapters', () => ({
  uninstallExtensionMcpHarness: (...args: unknown[]) => uninstallExtensionMcpHarnessMock(...args)
}))

const { prepareExtensionUninstall, setExtensionEnabled, trashDiscoveredSkill } = await import(
  './extension-removal'
)

const server = {
  key: 'acme',
  harnesses: [{ id: 'claude-code' }, { id: 'codex' }, { id: 'cursor' }]
}

const mcpItem = {
  entry: {
    id: 'acme-mcp',
    install: {
      method: 'config-write',
      provision: { install: 'pipx install acme', uninstall: 'pipx uninstall acme', binary: 'acme' },
      server
    }
  },
  state: {}
}

const skillItem = {
  entry: { id: 'local-skill-acme', install: { method: 'bundled-skill', skill: 'acme' } },
  state: { origin: { label: 'Home', path: '/home/dev/.agents/skills/acme/SKILL.md', providers: [] } }
}

beforeEach(() => {
  trashItemMock.mockReset()
  readExtensionInventoryMock.mockReset().mockResolvedValue({ entries: [mcpItem, skillItem] })
  installExtensionHarnessMock.mockReset()
  uninstallExtensionMcpHarnessMock.mockReset()
})

describe('setExtensionEnabled', () => {
  it('writes every harness when turned on', async () => {
    expect(await setExtensionEnabled({} as never, 'acme-mcp', true)).toBe(3)
    expect(installExtensionHarnessMock).toHaveBeenCalledTimes(3)
    expect(installExtensionHarnessMock.mock.calls[0][2]).toBe('claude-code')
  })

  it('clears every harness when turned off, and leaves the program alone', async () => {
    expect(await setExtensionEnabled({} as never, 'acme-mcp', false)).toBe(3)
    expect(uninstallExtensionMcpHarnessMock).toHaveBeenCalledTimes(3)
    expect(installExtensionHarnessMock).not.toHaveBeenCalled()
  })

  it('skips an agent this machine does not have', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [
        {
          ...mcpItem,
          state: {
            harnesses: [
              { id: 'claude-code', present: true },
              { id: 'codex', present: true },
              { id: 'cursor', present: false }
            ]
          }
        }
      ]
    })
    expect(await setExtensionEnabled({} as never, 'acme-mcp', true)).toBe(2)
    expect(installExtensionHarnessMock.mock.calls.map((call) => call[2])).toEqual([
      'claude-code',
      'codex'
    ])
  })

  it('still clears an absent agent when turned off', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [{ ...mcpItem, state: { harnesses: [{ id: 'cursor', present: false }] } }]
    })
    expect(await setExtensionEnabled({} as never, 'acme-mcp', false)).toBe(3)
  })

  it('refuses an entry that registers no server', async () => {
    await expect(setExtensionEnabled({} as never, 'local-skill-acme', false)).rejects.toThrow()
  })

  it('refuses an unknown id', async () => {
    await expect(setExtensionEnabled({} as never, 'nope', true)).rejects.toThrow()
  })
})

describe('prepareExtensionUninstall', () => {
  it('clears the harness entries and reports the removal command', async () => {
    const result = await prepareExtensionUninstall({} as never, 'acme-mcp')
    expect(result).toEqual({ harnessesCleared: 3, command: 'pipx uninstall acme' })
    expect(uninstallExtensionMcpHarnessMock).toHaveBeenCalledTimes(3)
  })

  it('reports no command when the catalog offers none', async () => {
    const result = await prepareExtensionUninstall({} as never, 'local-skill-acme')
    expect(result).toEqual({ harnessesCleared: 0, command: null })
  })
})

describe('trashDiscoveredSkill', () => {
  it('trashes the folder around the skill file, not the file alone', async () => {
    const path = await trashDiscoveredSkill({} as never, 'local-skill-acme')
    expect(path).toBe('/home/dev/.agents/skills/acme')
    expect(trashItemMock).toHaveBeenCalledWith('/home/dev/.agents/skills/acme')
  })

  it('refuses when Muster does not know where the skill lives', async () => {
    await expect(trashDiscoveredSkill({} as never, 'acme-mcp')).rejects.toThrow(
      /does not know where/
    )
    expect(trashItemMock).not.toHaveBeenCalled()
  })
})
