// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../../../shared/activecollab-mcp-types'
import { ACTIVECOLLAB_MCP_INSTALL_COMMAND } from '../../../../shared/activecollab-mcp-types'
import type {
  ExtensionHarnessState,
  ExtensionInventory
} from '../../../../shared/extension-state-types'
import type { SiteResult } from '../../../../shared/site-types'
import { _extensionInventoryForTests } from '@/hooks/useExtensionInventory'
import { useAppStore } from '@/store'
import { ActiveCollabMcpInstallCard } from './activecollab-mcp-install-card'

vi.mock('./activecollab-mcp-setup-terminal', () => ({
  ActiveCollabMcpSetupTerminal: (props: { command: string }) => (
    <div data-testid="activecollab-mcp-setup-terminal">{props.command}</div>
  )
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const statusMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpStatus>>>()
const seedMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpSeedResult>>>()
const inventoryMock = vi.fn<() => Promise<SiteResult<ExtensionInventory>>>()

function inventory(installed: boolean, harnesses: ExtensionHarnessState[]): ExtensionInventory {
  return {
    schemaVersion: 1,
    catalogOrigin: 'bundled',
    catalogUpdatedAt: '2026-10-01',
    scannedAt: 0,
    entries: [
      {
        entry: { id: 'activecollab-mcp' } as ExtensionInventory['entries'][number]['entry'],
        state: {
          id: 'activecollab-mcp',
          installed,
          installedVersion: null,
          latestVersion: null,
          status: installed ? 'current' : 'not-installed',
          binaryPath: null,
          harnesses,
          autoUpdateSupported: false,
          autoUpdateEnabled: false
        }
      }
    ]
  }
}

function status(found: boolean): ActiveCollabMcpStatus {
  return {
    binary: {
      found,
      path: found ? '/Users/tester/.local/bin/activecollab-mcp' : null,
      version: found ? '1.8.1' : null,
      source: found ? 'pipx' : null,
      installHint: ACTIVECOLLAB_MCP_INSTALL_COMMAND
    },
    credentialsPath: '/Users/tester/.activecollab-mcp/credentials.json',
    credentialsSeeded: true
  }
}

const claude: ExtensionHarnessState = {
  id: 'claude-code',
  label: 'Claude Code',
  configPath: '/Users/tester/.claude.json',
  present: true,
  configured: true,
  current: true
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  _extensionInventoryForTests.reset()
  statusMock.mockReset()
  seedMock.mockReset()
  inventoryMock.mockReset()
  ;(window as unknown as { api: unknown }).api = {
    activecollabMcp: { status: statusMock, seedCredentials: seedMock },
    extensions: {
      inventory: inventoryMock,
      runCommand: vi.fn(),
      cancelCommand: vi.fn(),
      installHarness: vi.fn(),
      uninstallHarness: vi.fn(),
      onRunEvent: () => () => {}
    }
  }
})

afterEach(() => {
  cleanup()
})

describe('ActiveCollabMcpInstallCard', () => {
  it('offers the one-click access button and no advanced setup before the server exists', async () => {
    statusMock.mockResolvedValue({ ok: true, value: status(false) })
    inventoryMock.mockResolvedValue({
      ok: true,
      value: inventory(false, [{ ...claude, configured: false, current: false }])
    })
    render(<ActiveCollabMcpInstallCard />)
    expect(await screen.findByRole('button', { name: 'Give my agents access' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Advanced setup/ })).toBeNull()
    expect(screen.getByText('Server not installed')).toBeInTheDocument()
  })

  it('runs the server wizard from Advanced setup once the server is installed', async () => {
    statusMock.mockResolvedValue({ ok: true, value: status(true) })
    inventoryMock.mockResolvedValue({ ok: true, value: inventory(true, [claude]) })
    render(<ActiveCollabMcpInstallCard />)
    expect(await screen.findByText('Up to date')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Advanced setup/ }))
    expect(await screen.findByTestId('activecollab-mcp-setup-terminal')).toHaveTextContent(
      'activecollab-mcp'
    )
  })

  it('shows the status error instead of rows when the read fails', async () => {
    statusMock.mockResolvedValue({ ok: false, error: 'status broke' })
    inventoryMock.mockResolvedValue({ ok: true, value: inventory(false, []) })
    render(<ActiveCollabMcpInstallCard />)
    expect(await screen.findByText('status broke')).toBeInTheDocument()
  })
})
