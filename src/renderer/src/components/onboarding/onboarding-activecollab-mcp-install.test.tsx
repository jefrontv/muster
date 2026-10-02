// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../../../shared/activecollab-mcp-types'
import { ACTIVECOLLAB_MCP_INSTALL_COMMAND } from '../../../../shared/activecollab-mcp-types'
import type { ExtensionCommandRunEvent } from '../../../../shared/extension-run-types'
import type {
  ExtensionHarnessState,
  ExtensionInventory
} from '../../../../shared/extension-state-types'
import type { SiteResult } from '../../../../shared/site-types'
import { _extensionInventoryForTests } from '@/hooks/useExtensionInventory'
import { useAppStore } from '@/store'
import { OnboardingActiveCollabMcpInstall } from './onboarding-activecollab-mcp-install'

const statusMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpStatus>>>()
const seedMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpSeedResult>>>()
const inventoryMock = vi.fn<() => Promise<SiteResult<ExtensionInventory>>>()
const runCommandMock = vi.fn()
const installHarnessMock = vi.fn()
let runListener: ((event: ExtensionCommandRunEvent) => void) | null = null

function harness(
  id: ExtensionHarnessState['id'],
  overrides: Partial<ExtensionHarnessState> = {}
): ExtensionHarnessState {
  return {
    id,
    label: `${id} agent`,
    configPath: `/Users/tester/config/${id}.json`,
    present: true,
    configured: false,
    current: false,
    ...overrides
  }
}

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
          installedVersion: installed ? '1.8.1' : null,
          latestVersion: '1.8.1',
          status: installed ? 'current' : 'not-installed',
          binaryPath: installed ? '/Users/tester/.local/bin/activecollab-mcp' : null,
          harnesses,
          autoUpdateSupported: false,
          autoUpdateEnabled: false
        }
      }
    ]
  }
}

function mcpStatus(found: boolean, credentialsSeeded = true): ActiveCollabMcpStatus {
  return {
    binary: {
      found,
      path: found ? '/Users/tester/.local/bin/activecollab-mcp' : null,
      version: found ? '1.8.1' : null,
      source: found ? 'pipx' : null,
      installHint: ACTIVECOLLAB_MCP_INSTALL_COMMAND
    },
    credentialsPath: '/Users/tester/.activecollab-mcp/credentials.json',
    credentialsSeeded
  }
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  _extensionInventoryForTests.reset()
  for (const mock of [statusMock, seedMock, inventoryMock, runCommandMock, installHarnessMock]) {
    mock.mockReset()
  }
  runListener = null
  seedMock.mockResolvedValue({
    ok: true,
    value: { seeded: true, path: '/x', issuedFor: 'tester@efront.com.au' }
  })
  runCommandMock.mockResolvedValue({ ok: true, value: { command: 'pipx install', code: 0 } })
  ;(window as unknown as { api: unknown }).api = {
    activecollabMcp: { status: statusMock, seedCredentials: seedMock },
    extensions: {
      inventory: inventoryMock,
      runCommand: runCommandMock,
      cancelCommand: vi.fn(),
      installHarness: installHarnessMock,
      uninstallHarness: vi.fn(),
      onRunEvent: (listener: (event: ExtensionCommandRunEvent) => void) => {
        runListener = listener
        return () => {
          runListener = null
        }
      }
    }
  }
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('OnboardingActiveCollabMcpInstall', () => {
  it('offers one button that installs the server through the hub when it is missing', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus(false) })
    inventoryMock.mockResolvedValue({
      ok: true,
      value: inventory(false, [harness('claude-code'), harness('codex')])
    })
    render(<OnboardingActiveCollabMcpInstall />)
    const button = await screen.findByRole('button', { name: 'Give my agents access' })
    expect(button).toBeEnabled()
    // No per-agent Install buttons: the rows are results, not prerequisites.
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    fireEvent.click(button)
    await waitFor(() =>
      expect(runCommandMock).toHaveBeenCalledWith({ id: 'activecollab-mcp', mode: 'install' })
    )
  })

  it('writes the credential file after the hub install succeeds', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus(false, false) })
    inventoryMock.mockResolvedValue({ ok: true, value: inventory(false, [harness('claude-code')]) })
    render(<OnboardingActiveCollabMcpInstall />)
    fireEvent.click(await screen.findByRole('button', { name: 'Give my agents access' }))
    await waitFor(() => expect(runListener).not.toBeNull())
    act(() => {
      runListener?.({
        kind: 'finished',
        id: 'activecollab-mcp',
        code: 0,
        timedOut: false,
        installed: true,
        registeredHarnesses: ['Claude Code']
      })
    })
    await waitFor(() => expect(seedMock).toHaveBeenCalledTimes(1))
  })

  it('only adds the server to agents that lack it when it is already installed', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus(true) })
    const before = inventory(true, [
      harness('claude-code', { configured: true, current: true }),
      harness('codex')
    ])
    inventoryMock.mockResolvedValue({ ok: true, value: before })
    installHarnessMock.mockResolvedValue({
      ok: true,
      value: inventory(true, [
        harness('claude-code', { configured: true, current: true }),
        harness('codex', { configured: true, current: true })
      ])
    })
    render(<OnboardingActiveCollabMcpInstall />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add to 1 more agent' }))
    await waitFor(() =>
      expect(installHarnessMock).toHaveBeenCalledWith({
        id: 'activecollab-mcp',
        harnessId: 'codex'
      })
    )
    expect(installHarnessMock).toHaveBeenCalledTimes(1)
    expect(runCommandMock).not.toHaveBeenCalled()
  })

  it('says to install pipx, with the command to copy, when the hub cannot run pipx', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus(false) })
    inventoryMock.mockResolvedValue({ ok: true, value: inventory(false, [harness('claude-code')]) })
    render(<OnboardingActiveCollabMcpInstall />)
    fireEvent.click(await screen.findByRole('button', { name: 'Give my agents access' }))
    await waitFor(() => expect(runListener).not.toBeNull())
    act(() => {
      runListener?.({
        kind: 'finished',
        id: 'activecollab-mcp',
        code: 127,
        timedOut: false,
        installed: false,
        registeredHarnesses: [],
        missingTool: {
          tool: 'pipx',
          installCommand: 'brew install pipx',
          installUrl: 'https://pipx.pypa.io',
          message: 'ActiveCollab MCP needs pipx. Install it with Homebrew, then try again.'
        }
      })
    })
    expect(
      await screen.findByText(
        'ActiveCollab MCP needs pipx. Install it with Homebrew, then try again.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('brew install pipx')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(runCommandMock).toHaveBeenCalledTimes(2))
  })

  it('reads Ready with every agent added and no action left', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus(true) })
    inventoryMock.mockResolvedValue({
      ok: true,
      value: inventory(true, [harness('claude-code', { configured: true, current: true })])
    })
    render(<OnboardingActiveCollabMcpInstall />)
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Give my agents access' })).toBeNull()
  })
})
