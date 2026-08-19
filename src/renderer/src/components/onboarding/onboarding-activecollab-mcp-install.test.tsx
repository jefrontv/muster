// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActiveCollabMcpAgentId,
  ActiveCollabMcpAgentStatus,
  ActiveCollabMcpInstallResult,
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../../../shared/activecollab-mcp-types'
import { ACTIVECOLLAB_MCP_INSTALL_COMMAND } from '../../../../shared/activecollab-mcp-types'
import type { SiteResult } from '../../../../shared/site-types'
import { useAppStore } from '@/store'
import { OnboardingActiveCollabMcpInstall } from './onboarding-activecollab-mcp-install'

vi.mock('@/components/settings/activecollab-mcp-setup-terminal', () => ({
  ActiveCollabMcpSetupTerminal: (props: { command: string }) => (
    <div data-testid="activecollab-mcp-setup-terminal">{props.command}</div>
  )
}))

const statusMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpStatus>>>()
const installMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpInstallResult>>>()
const seedMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpSeedResult>>>()

function agent(
  id: ActiveCollabMcpAgentId,
  overrides: Partial<ActiveCollabMcpAgentStatus> = {}
): ActiveCollabMcpAgentStatus {
  return {
    id,
    label: `${id} agent`,
    configPath: `/Users/tester/config/${id}.json`,
    present: true,
    configured: false,
    current: false,
    requiresRunningServer: id === 'cursor',
    ...overrides
  }
}

function mcpStatus(overrides: Partial<ActiveCollabMcpStatus> = {}): ActiveCollabMcpStatus {
  return {
    binary: {
      found: false,
      path: null,
      version: null,
      source: null,
      installHint: ACTIVECOLLAB_MCP_INSTALL_COMMAND
    },
    agents: [agent('claude-code'), agent('codex'), agent('cursor')],
    credentialsPath: '/Users/tester/.activecollab-mcp/credentials.json',
    credentialsSeeded: true,
    ...overrides
  }
}

const installedBinary = {
  found: true,
  path: '/Users/tester/.local/bin/activecollab-mcp',
  version: '1.8.1',
  source: 'pipx' as const,
  installHint: ''
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  statusMock.mockReset()
  installMock.mockReset()
  seedMock.mockReset()
  statusMock.mockResolvedValue({ ok: true, value: mcpStatus() })
  installMock.mockResolvedValue({
    ok: true,
    value: {
      results: [{ id: 'claude-code', configPath: '/Users/tester/.claude.json', ok: true }],
      status: mcpStatus({
        binary: installedBinary,
        agents: [agent('claude-code', { configured: true, current: true })]
      })
    }
  })
  ;(window as unknown as { api: unknown }).api = {
    activecollabMcp: { status: statusMock, install: installMock, seedCredentials: seedMock }
  }
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('OnboardingActiveCollabMcpInstall', () => {
  it('offers the pipx install when the server is missing', async () => {
    render(<OnboardingActiveCollabMcpInstall />)

    expect(await screen.findByRole('button', { name: 'Run Setup' })).toBeInTheDocument()
    expect(screen.getByText('Setup needed')).toBeInTheDocument()
    expect(installMock).not.toHaveBeenCalled()
  })

  it('opens the guided terminal with the pipx install command', async () => {
    render(<OnboardingActiveCollabMcpInstall />)

    fireEvent.click(await screen.findByRole('button', { name: 'Run Setup' }))

    expect(screen.getByTestId('activecollab-mcp-setup-terminal')).toHaveTextContent(
      `${ACTIVECOLLAB_MCP_INSTALL_COMMAND}; exit`
    )
  })

  it('lists every agent instead of silently wiring only Claude', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus({ binary: installedBinary }) })

    render(<OnboardingActiveCollabMcpInstall />)

    // One row per agent, each with its own action — nothing is written for the
    // user behind their back.
    for (const id of ['claude-code', 'codex', 'cursor'] as ActiveCollabMcpAgentId[]) {
      expect(await screen.findByText(`${id} agent`)).toBeInTheDocument()
    }
    expect(installMock).not.toHaveBeenCalled()
  })

  it('installs only the agent whose button was pressed', async () => {
    statusMock.mockResolvedValue({ ok: true, value: mcpStatus({ binary: installedBinary }) })

    render(<OnboardingActiveCollabMcpInstall />)

    const codexRow = (await screen.findByText('codex agent')).closest('[data-agent-id="codex"]')
    expect(codexRow).not.toBeNull()
    fireEvent.click(within(codexRow as HTMLElement).getByRole('button'))

    await waitFor(() => {
      expect(installMock).toHaveBeenCalledWith({ agentIds: ['codex'] })
    })
  })

  it('does not claim Ready while an installed agent is still unconfigured', async () => {
    // The old behaviour: Claude wired, so the step said Ready — while a Codex or
    // Cursor user had nothing.
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        binary: installedBinary,
        agents: [
          agent('claude-code', { configured: true, current: true }),
          agent('codex'),
          agent('cursor')
        ]
      })
    })

    render(<OnboardingActiveCollabMcpInstall />)

    expect(await screen.findByText('Setup needed')).toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('ignores agents the user does not have installed', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        binary: installedBinary,
        agents: [
          agent('claude-code', { configured: true, current: true }),
          agent('codex', { present: false }),
          agent('cursor', { present: false })
        ]
      })
    })

    render(<OnboardingActiveCollabMcpInstall />)

    expect(await screen.findByText('Ready')).toBeInTheDocument()
  })

  it('withholds Ready until the credentials file is seeded', async () => {
    // Without it the server starts and cannot authenticate.
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        binary: installedBinary,
        credentialsSeeded: false,
        agents: [agent('claude-code', { configured: true, current: true })]
      })
    })

    render(<OnboardingActiveCollabMcpInstall />)

    expect(await screen.findByText('Setup needed')).toBeInTheDocument()
  })
})
