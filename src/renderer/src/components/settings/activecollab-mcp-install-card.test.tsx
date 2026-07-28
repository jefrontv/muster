// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActiveCollabMcpAgentId,
  ActiveCollabMcpAgentStatus,
  ActiveCollabMcpInstallResult,
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../../../shared/activecollab-mcp-types'
import type { SiteResult } from '../../../../shared/site-types'

// Stubbed so these cases stay about card wiring; the PTY itself is covered by
// activecollab-mcp-setup-terminal.test.tsx.
const setupTerminalHarness = vi.hoisted(() => ({
  props: [] as { command: string; onProcessExit: () => void; onDismiss: () => void }[]
}))
vi.mock('./activecollab-mcp-setup-terminal', () => ({
  ActiveCollabMcpSetupTerminal: (props: {
    command: string
    onProcessExit: () => void
    onDismiss: () => void
  }) => {
    setupTerminalHarness.props.push(props)
    return <div data-testid="activecollab-mcp-setup-terminal">{props.command}</div>
  }
}))
import { ActiveCollabMcpInstallCard } from './activecollab-mcp-install-card'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const statusMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpStatus>>>()
const installMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpInstallResult>>>()
const seedMock = vi.fn<() => Promise<SiteResult<ActiveCollabMcpSeedResult>>>()

const CREDENTIALS_PATH = '/Users/tester/.activecollab-mcp/credentials.json'

function agent(
  id: ActiveCollabMcpAgentId,
  overrides: Partial<ActiveCollabMcpAgentStatus> = {}
): ActiveCollabMcpAgentStatus {
  return {
    id,
    label: `${id} agent`,
    configPath: `/Users/tester/config/${id}.json`,
    present: true,
    configured: true,
    current: true,
    requiresRunningServer: id === 'cursor',
    ...overrides
  }
}

function mcpStatus(overrides: Partial<ActiveCollabMcpStatus> = {}): ActiveCollabMcpStatus {
  return {
    binary: {
      found: true,
      path: '/Users/tester/.local/bin/activecollab-mcp',
      version: '1.8.1',
      source: 'pipx',
      installHint: ''
    },
    agents: [agent('claude-code'), agent('codex'), agent('cursor')],
    credentialsPath: CREDENTIALS_PATH,
    credentialsSeeded: false,
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderCard(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ActiveCollabMcpInstallCard />)
  })
  // The status read resolves in a microtask after the mount effect fires.
  await act(async () => {})
  return container
}

function requireElement(rendered: HTMLDivElement, selector: string): HTMLElement {
  const found = rendered.querySelector<HTMLElement>(selector)
  if (!found) {
    throw new Error(`No element matched ${selector}`)
  }
  return found
}

function agentRow(rendered: HTMLDivElement, id: ActiveCollabMcpAgentId): HTMLElement {
  return requireElement(rendered, `[data-agent-id="${id}"]`)
}

function button(scope: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!match) {
    throw new Error(`No button labelled "${label}"`)
  }
  return match
}

async function click(target: HTMLButtonElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {})
}

beforeEach(() => {
  statusMock.mockReset()
  installMock.mockReset()
  seedMock.mockReset()
  setupTerminalHarness.props.length = 0
  statusMock.mockResolvedValue({ ok: true, value: mcpStatus() })
  ;(window as unknown as { api: unknown }).api = {
    activecollabMcp: { status: statusMock, install: installMock, seedCredentials: seedMock },
    ui: { writeClipboardText: vi.fn(async () => {}) }
  }
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
})

describe('ActiveCollabMcpInstallCard', () => {
  it('renders configured-and-current, stale, and not-configured as three distinct states', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        agents: [
          agent('claude-code'),
          agent('codex', { current: false }),
          agent('cursor', { configured: false, current: false })
        ]
      })
    })

    const rendered = await renderCard()

    expect(agentRow(rendered, 'claude-code').dataset.agentState).toBe('current')
    expect(agentRow(rendered, 'claude-code').textContent).toContain('Installed and current')

    const stale = agentRow(rendered, 'codex')
    expect(stale.dataset.agentState).toBe('stale')
    expect(stale.textContent).toContain('Muster entry out of date')
    expect(stale.textContent).toContain('points at a different command')
    expect(button(stale, 'Update entry').disabled).toBe(false)

    const unconfigured = agentRow(rendered, 'cursor')
    expect(unconfigured.dataset.agentState).toBe('unconfigured')
    expect(unconfigured.textContent).toContain('Not configured by Muster')
    // The rival-key caution: an entry Muster cannot see is not the same as a broken agent.
    expect(unconfigured.textContent).toContain('under a different key')
  })

  it('renders an uninstalled agent as its own state, not as unconfigured', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        agents: [agent('claude-code', { present: false, configured: false, current: false })]
      })
    })

    const rendered = await renderCard()
    const row = agentRow(rendered, 'claude-code')

    expect(row.dataset.agentState).toBe('missing-agent')
    expect(row.textContent).toContain('Agent not detected')
    expect(row.textContent).not.toContain('Not configured by Muster')
  })

  it('shows the install hint and blocks only the agents that need the binary', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        binary: {
          found: false,
          path: null,
          version: null,
          source: null,
          installHint: 'pipx install activecollab-mcp'
        },
        agents: [
          agent('claude-code', { configured: false, current: false }),
          agent('cursor', { configured: false, current: false })
        ]
      })
    })

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('pipx install activecollab-mcp')

    const local = agentRow(rendered, 'claude-code')
    expect(button(local, 'Install').disabled).toBe(true)
    expect(local.textContent).toContain('would be pointed at nothing')

    // Cursor speaks HTTP, so a missing binary is irrelevant to it.
    const http = agentRow(rendered, 'cursor')
    expect(button(http, 'Install').disabled).toBe(false)
    expect(http.textContent).not.toContain('would be pointed at nothing')
  })

  it('re-reads status after a successful install and names the file it wrote', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({ agents: [agent('codex', { current: false })] })
    })
    installMock.mockResolvedValue({
      ok: true,
      value: {
        results: [{ id: 'codex', configPath: '/Users/tester/config/codex.json', ok: true }],
        status: mcpStatus({ agents: [agent('codex')] })
      }
    })

    const rendered = await renderCard()
    expect(statusMock).toHaveBeenCalledTimes(1)

    await click(button(agentRow(rendered, 'codex'), 'Update entry'))

    expect(installMock).toHaveBeenCalledWith({ agentIds: ['codex'] })
    expect(statusMock).toHaveBeenCalledTimes(2)
    expect(agentRow(rendered, 'codex').textContent).toContain(
      'Wrote the "activecollab" entry to /Users/tester/config/codex.json'
    )
  })

  it('surfaces a failed install and leaves the action usable', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({ agents: [agent('codex', { configured: false, current: false })] })
    })
    installMock.mockResolvedValue({ ok: false, error: 'EACCES: permission denied' })

    const rendered = await renderCard()
    await click(button(agentRow(rendered, 'codex'), 'Install'))

    const row = agentRow(rendered, 'codex')
    expect(row.querySelector('[role="alert"]')?.textContent).toContain('EACCES: permission denied')
    expect(button(row, 'Install').disabled).toBe(false)
    // A failed write must not be mistaken for a completed one.
    expect(statusMock).toHaveBeenCalledTimes(1)
    expect(row.dataset.agentState).toBe('unconfigured')
  })

  it('reports the credential file path after seeding', async () => {
    seedMock.mockResolvedValue({
      ok: true,
      value: { seeded: true, path: CREDENTIALS_PATH, issuedFor: 'ada@example.com' }
    })

    const rendered = await renderCard()
    const credentials = requireElement(rendered, '[data-testid="activecollab-mcp-credentials"]')
    expect(credentials.textContent).toContain('writes your ActiveCollab token to a file on disk')

    await click(button(credentials, 'Write credential file'))

    expect(seedMock).toHaveBeenCalledTimes(1)
    expect(credentials.textContent).toContain(
      `Wrote credentials for ada@example.com to ${CREDENTIALS_PATH}`
    )
  })

  it('reports "nothing to seed" without dressing it up as a failure', async () => {
    seedMock.mockResolvedValue({
      ok: true,
      value: { seeded: false, reason: 'ActiveCollab is not connected in Muster.' }
    })

    const rendered = await renderCard()
    const credentials = requireElement(rendered, '[data-testid="activecollab-mcp-credentials"]')

    await click(button(credentials, 'Write credential file'))

    expect(credentials.textContent).toContain('ActiveCollab is not connected in Muster.')
    expect(credentials.querySelector('[role="alert"]')).toBeNull()
  })

  it('stops checking and shows the reason when the status read fails', async () => {
    statusMock.mockResolvedValue({ ok: false, error: 'MCP status unavailable' })

    const rendered = await renderCard()

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      'MCP status unavailable'
    )
    expect(rendered.textContent).toContain('Status unavailable')
    expect(rendered.querySelector('.animate-spin')).toBeNull()
  })

  it('offers guided setup only once the server binary is detected', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: mcpStatus({
        binary: {
          found: false,
          path: null,
          version: null,
          source: null,
          installHint: 'pipx install activecollab-mcp'
        }
      })
    })

    const rendered = await renderCard()

    expect(button(rendered, 'Run Setup').disabled).toBe(true)
    expect(rendered.querySelector('[data-testid="activecollab-mcp-setup-terminal"]')).toBeNull()
  })

  it('runs setup from the resolved absolute path and re-reads status when it exits', async () => {
    const rendered = await renderCard()

    await click(button(rendered, 'Run Setup'))

    const terminal = requireElement(rendered, '[data-testid="activecollab-mcp-setup-terminal"]')
    // A bare `activecollab-mcp` resolves against the GUI app's PATH, which routinely lacks ~/.local/bin.
    expect(terminal.textContent).toContain('/Users/tester/.local/bin/activecollab-mcp')
    expect(setupTerminalHarness.props.at(-1)?.command).toContain('setup')
    // Re-opening while it is already live would spawn a second PTY over the first.
    expect(button(rendered, 'Run Setup').disabled).toBe(true)

    expect(statusMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      setupTerminalHarness.props.at(-1)?.onProcessExit()
    })
    expect(statusMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      setupTerminalHarness.props.at(-1)?.onDismiss()
    })
    expect(rendered.querySelector('[data-testid="activecollab-mcp-setup-terminal"]')).toBeNull()
  })
})
