// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SiteMcpGlobalInstallResult,
  SiteMcpGlobalStatus,
  SiteMcpHarnessId,
  SiteMcpHarnessStatus
} from '../../../../shared/site-mcp-types'
import type { SiteResult } from '../../../../shared/site-types'
import { SiteMcpInstallCard } from './site-mcp-install-card'

const globalStatusMock = vi.fn<() => Promise<SiteResult<SiteMcpGlobalStatus>>>()
const globalInstallMock = vi.fn<() => Promise<SiteResult<SiteMcpGlobalInstallResult>>>()

function harness(
  id: SiteMcpHarnessId,
  overrides: Partial<SiteMcpHarnessStatus> = {}
): SiteMcpHarnessStatus {
  return {
    id,
    label: `${id} harness`,
    configPath: `/Users/tester/config/${id}`,
    present: true,
    configured: true,
    current: true,
    ...overrides
  }
}

function globalStatus(overrides: Partial<SiteMcpGlobalStatus> = {}): SiteMcpGlobalStatus {
  return {
    serverName: 'muster-sites',
    command: {
      command: '/Applications/Muster.app/Contents/MacOS/Muster',
      args: ['--site-mcp'],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    },
    harnesses: [harness('claude-code'), harness('codex'), harness('cursor')],
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderCard(enabled = true): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SiteMcpInstallCard enabled={enabled} />)
  })
  // The status read resolves in a microtask after the mount effect fires.
  await act(async () => {})
  return container
}

function harnessRow(rendered: HTMLDivElement, id: SiteMcpHarnessId): HTMLElement {
  const found = rendered.querySelector<HTMLElement>(`[data-harness-id="${id}"]`)
  if (!found) {
    throw new Error(`No row for harness ${id}`)
  }
  return found
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
  globalStatusMock.mockReset()
  globalInstallMock.mockReset()
  globalStatusMock.mockResolvedValue({ ok: true, value: globalStatus() })
  Object.assign(window, {
    api: { siteMcp: { globalStatus: globalStatusMock, globalInstall: globalInstallMock } }
  })
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

describe('SiteMcpInstallCard', () => {
  it('renders current, stale, unconfigured, and missing as four distinct states', async () => {
    globalStatusMock.mockResolvedValue({
      ok: true,
      value: globalStatus({
        harnesses: [
          harness('claude-code'),
          harness('codex', { current: false }),
          harness('cursor', { configured: false, current: false, present: false })
        ]
      })
    })
    const rendered = await renderCard()
    expect(harnessRow(rendered, 'claude-code').dataset.harnessState).toBe('current')
    expect(harnessRow(rendered, 'codex').dataset.harnessState).toBe('stale')
    expect(harnessRow(rendered, 'cursor').dataset.harnessState).toBe('missing-harness')
    // The command line and the workspace auto-registration note anchor the card's context.
    expect(rendered.textContent).toContain('/Applications/Muster.app/Contents/MacOS/Muster')
    expect(rendered.textContent).toContain('.mcp.json')
  })

  it('installs through IPC and re-checks the status afterwards', async () => {
    globalStatusMock.mockResolvedValue({
      ok: true,
      value: globalStatus({ harnesses: [harness('codex', { configured: false, current: false })] })
    })
    globalInstallMock.mockResolvedValue({
      ok: true,
      value: { configPath: '/Users/tester/config/codex', status: globalStatus() }
    })
    const rendered = await renderCard()
    const readsBefore = globalStatusMock.mock.calls.length

    await click(button(harnessRow(rendered, 'codex'), 'Install'))

    expect(globalInstallMock).toHaveBeenCalledWith({ harnessId: 'codex' })
    expect(globalStatusMock.mock.calls.length).toBe(readsBefore + 1)
    expect(rendered.textContent).toContain('/Users/tester/config/codex')
  })

  it('surfaces a failed install as an inline error on the harness row', async () => {
    globalInstallMock.mockResolvedValue({ ok: false, error: 'config.toml is not valid TOML' })
    const rendered = await renderCard()

    await click(button(harnessRow(rendered, 'codex'), 'Rewrite entry'))

    const alert = harnessRow(rendered, 'codex').querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('config.toml is not valid TOML')
  })

  it('disables every install action with a reason when Site tools are switched off', async () => {
    const rendered = await renderCard(false)
    const install = button(harnessRow(rendered, 'claude-code'), 'Rewrite entry')
    expect(install.disabled).toBe(true)
    expect(harnessRow(rendered, 'claude-code').textContent).toContain('Site tools are switched off')
    await click(install)
    expect(globalInstallMock).not.toHaveBeenCalled()
    // The state stays readable: the toggle blocks writes, not visibility.
    expect(harnessRow(rendered, 'claude-code').dataset.harnessState).toBe('current')
  })

  it('shows the load error instead of a stuck spinner when the status read fails', async () => {
    globalStatusMock.mockResolvedValue({ ok: false, error: 'status backend unavailable' })
    const rendered = await renderCard()
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      'status backend unavailable'
    )
  })
})
