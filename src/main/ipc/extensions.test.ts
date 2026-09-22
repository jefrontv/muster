import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (event: unknown, args?: unknown) => Promise<unknown>>()

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: (event: unknown, args?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    }
  }
}))

const readExtensionInventoryMock = vi.fn()
const installExtensionHarnessMock = vi.fn()
const uninstallExtensionMcpHarnessMock = vi.fn()
const harnessStatesMock = vi.fn(() => [] as unknown[])
const runCommandMock = vi.fn()

vi.mock('../extensions/extension-service', () => ({
  readExtensionInventory: (...args: unknown[]) => readExtensionInventoryMock(...args),
  installExtensionHarness: (...args: unknown[]) => installExtensionHarnessMock(...args),
  resolveExtensionServer: (_store: unknown, entry: { install: { server?: unknown } }) =>
    entry.install.server ?? null,
  findCatalogEntry: (inventory: { entries: { entry: { id: string } }[] }, id: string) =>
    inventory.entries.find(({ entry }) => entry.id === id)?.entry ?? null
}))

vi.mock('../extensions/mcp-entry-adapters', () => ({
  uninstallExtensionMcpHarness: (...args: unknown[]) => uninstallExtensionMcpHarnessMock(...args),
  readExtensionMcpHarnessStates: (...args: unknown[]) => harnessStatesMock(...(args as []))
}))

vi.mock('../extensions/binary-probe', () => ({
  probeBinary: () => ({ found: true, path: '/usr/bin/acme-mcp' })
}))

vi.mock('../extensions/command-run', () => ({
  cancelExtensionCommandRun: () => undefined,
  runExtensionCommandForEntry: (...args: unknown[]) => runCommandMock(...args)
}))

const { registerExtensionHandlers } = await import('./extensions')

const mcpEntry = {
  id: 'acme-mcp',
  install: {
    method: 'config-write',
    provision: { install: 'pipx install acme', binary: 'acme-mcp' },
    server: { key: 'acme', harnesses: [{ id: 'claude-code' }] }
  }
}

const inventory = { schemaVersion: 1, entries: [{ entry: mcpEntry, state: {} }] }

function createStore(settings: Record<string, unknown> = {}): {
  getSettings: () => Record<string, unknown>
  updateSettings: ReturnType<typeof vi.fn>
} {
  const state = { ...settings }
  return {
    getSettings: () => state,
    updateSettings: vi.fn((updates: Record<string, unknown>) => {
      Object.assign(state, updates)
      return state
    })
  }
}

async function invoke(channel: string, args?: unknown): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler for ${channel}`)
  }
  return handler({}, args)
}

beforeEach(() => {
  handlers.clear()
  readExtensionInventoryMock.mockReset().mockResolvedValue(inventory)
  installExtensionHarnessMock.mockReset()
  uninstallExtensionMcpHarnessMock.mockReset()
  harnessStatesMock.mockReset().mockReturnValue([])
  runCommandMock.mockReset().mockResolvedValue({ command: 'pipx install acme', code: 0 })
})

describe('extensions IPC', () => {
  it('returns the inventory', async () => {
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:inventory')).toEqual({ ok: true, value: inventory })
  })

  it('passes force through rather than ignoring a manual re-check', async () => {
    registerExtensionHandlers(createStore() as never)
    await invoke('extensions:inventory', { force: true })
    expect(readExtensionInventoryMock).toHaveBeenCalledWith(expect.anything(), { force: true })
  })

  it('answers with an error result instead of throwing across the bridge', async () => {
    readExtensionInventoryMock.mockRejectedValueOnce(new Error('disk on fire'))
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:inventory')).toEqual({ ok: false, error: 'disk on fire' })
  })

  it('installs a harness for a config-write entry', async () => {
    registerExtensionHandlers(createStore() as never)
    const result = await invoke('extensions:installHarness', {
      id: 'acme-mcp',
      harnessId: 'claude-code'
    })
    expect(result).toMatchObject({ ok: true })
    // The entry, not the raw server spec: the service resolves the user's own values into it.
    expect(installExtensionHarnessMock.mock.calls[0][1]).toMatchObject({ id: 'acme-mcp' })
    expect(installExtensionHarnessMock.mock.calls[0][2]).toBe('claude-code')
  })

  it('runs an install when no mode is given', async () => {
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:runCommand', { id: 'acme-mcp' })).toMatchObject({ ok: true })
    expect(runCommandMock).toHaveBeenCalledWith(expect.anything(), 'acme-mcp', 'install')
  })

  it('runs the setup pass when asked for it', async () => {
    registerExtensionHandlers(createStore() as never)
    await invoke('extensions:runCommand', { id: 'acme-mcp', mode: 'setup' })
    expect(runCommandMock).toHaveBeenCalledWith(expect.anything(), 'acme-mcp', 'setup')
  })

  it('refuses a mode the renderer is not allowed to pick', async () => {
    registerExtensionHandlers(createStore() as never)
    // Uninstall has its own channel, because it clears the config entries first and that order is
    // not the renderer's to choose. Anything unrecognised falls back to install.
    await invoke('extensions:runCommand', { id: 'acme-mcp', mode: 'uninstall' })
    expect(runCommandMock).toHaveBeenCalledWith(expect.anything(), 'acme-mcp', 'install')
  })

  it('refreshes only the harnesses that already have an entry', async () => {
    harnessStatesMock.mockReturnValue([
      { id: 'claude-code', label: 'Claude Code', present: true, configured: true, current: false },
      { id: 'codex', label: 'Codex', present: true, configured: false, current: false }
    ])
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:refreshHarnesses', { id: 'acme-mcp' })).toMatchObject({
      ok: true
    })
    expect(installExtensionHarnessMock.mock.calls.map((call) => call[2])).toEqual(['claude-code'])
  })

  it('refuses to refresh an extension that is not in the catalog', async () => {
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:refreshHarnesses', { id: 'nope' })).toMatchObject({
      ok: false
    })
  })

  it('rejects an unknown harness id', async () => {
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:installHarness', { id: 'acme-mcp', harnessId: 'notepad' }))
      .toMatchObject({ ok: false })
  })

  it('rejects an entry that registers no MCP server', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [{ entry: { id: 'acme', install: { method: 'command', command: {} } }, state: {} }]
    })
    registerExtensionHandlers(createStore() as never)
    expect(await invoke('extensions:installHarness', { id: 'acme', harnessId: 'codex' }))
      .toMatchObject({ ok: false })
  })

  it('uninstalls a harness entry', async () => {
    registerExtensionHandlers(createStore() as never)
    await invoke('extensions:uninstallHarness', { id: 'acme-mcp', harnessId: 'claude-code' })
    expect(uninstallExtensionMcpHarnessMock).toHaveBeenCalledWith(
      mcpEntry.install.server,
      'claude-code'
    )
  })

})
