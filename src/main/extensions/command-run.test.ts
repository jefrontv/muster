import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionCommandRunEvent } from '../../shared/extension-run-types'
import type { Store } from '../persistence'

const { sent, inventoryMock, probeMock, streamMock } = vi.hoisted(() => ({
  sent: [] as ExtensionCommandRunEvent[],
  inventoryMock: vi.fn(),
  probeMock: vi.fn(),
  streamMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (_channel: string, event: ExtensionCommandRunEvent) => sent.push(event)
        }
      }
    ]
  }
}))
vi.mock('./extension-service', () => ({
  readExtensionInventory: inventoryMock,
  installExtensionHarness: vi.fn(),
  resolveExtensionServer: () => null
}))
vi.mock('./binary-probe', () => ({ probeBinary: probeMock }))
vi.mock('../lib/stream-command', () => ({ streamCommand: streamMock }))

import { runExtensionCommandForEntry } from './command-run'

const store = {} as Store
const entry = {
  id: 'activecollab-mcp',
  name: 'ActiveCollab MCP',
  install: {
    method: 'command',
    command: {
      install: 'pipx install activecollab-mcp',
      binary: 'activecollab-mcp',
      requires: ['pipx']
    }
  }
}

function finished(): Extract<ExtensionCommandRunEvent, { kind: 'finished' }> {
  const event = sent.find((candidate) => candidate.kind === 'finished')
  if (event?.kind !== 'finished') {
    throw new Error('no finished event')
  }
  return event
}

beforeEach(() => {
  sent.length = 0
  inventoryMock.mockResolvedValue({
    entries: [{ entry, state: { installed: false, status: 'not-installed', latestVersion: null } }]
  })
  probeMock.mockReset()
  streamMock.mockReset()
})

describe('runExtensionCommandForEntry required tools', () => {
  it('names the missing program instead of running the command', async () => {
    probeMock.mockReturnValue({ found: false, path: null })

    const result = await runExtensionCommandForEntry(store, 'activecollab-mcp')

    expect(result.code).toBe(127)
    expect(streamMock).not.toHaveBeenCalled()
    expect(finished().missingTool).toMatchObject({ tool: 'pipx' })
    expect(finished().missingTool?.message).toContain('ActiveCollab MCP needs pipx.')
  })

  it('maps a 127 exit to the program the command starts', async () => {
    // pipx probes as present before the run (a stale PATH), then the shell cannot find it.
    probeMock
      .mockReturnValueOnce({ found: true, path: '/x/pipx' })
      .mockReturnValue({ found: false, path: null })
    streamMock.mockResolvedValue({ code: 127, timedOut: false })

    await runExtensionCommandForEntry(store, 'activecollab-mcp')

    expect(finished().code).toBe(127)
    expect(finished().missingTool).toMatchObject({ tool: 'pipx' })
  })

  it('runs as before when every required program is present', async () => {
    probeMock.mockReturnValue({ found: true, path: '/x/bin' })
    streamMock.mockResolvedValue({ code: 0, timedOut: false })

    await runExtensionCommandForEntry(store, 'activecollab-mcp')

    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(finished().missingTool).toBeUndefined()
  })
})
