// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteMcpHarnessStatus } from '../../../../shared/site-mcp-types'
import { _extensionInventoryForTests } from '@/hooks/useExtensionInventory'
import { OnboardingSiteMcpStep } from './onboarding-site-mcp-step'

const statusMock = vi.fn()
const installMock = vi.fn()

function harness(id: string, overrides: Partial<SiteMcpHarnessStatus> = {}): SiteMcpHarnessStatus {
  return {
    id: id as SiteMcpHarnessStatus['id'],
    label: id,
    configPath: `/home/${id}.json`,
    present: true,
    configured: false,
    current: false,
    ...overrides
  }
}

beforeEach(() => {
  _extensionInventoryForTests.reset()
  statusMock.mockReset()
  installMock.mockReset()
  installMock.mockResolvedValue({ ok: true, value: { configPath: '/x' } })
  ;(window as unknown as { api: unknown }).api = {
    siteMcp: { globalStatus: statusMock, globalInstall: installMock },
    extensions: {
      inventory: vi.fn().mockResolvedValue({ ok: false, error: 'offline' }),
      runCommand: vi.fn(),
      onRunEvent: () => () => {}
    }
  }
})

afterEach(() => {
  cleanup()
})

describe('OnboardingSiteMcpStep', () => {
  it('installs into every agent that lacks site tools from one button', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: {
        serverName: 'muster-sites',
        command: {},
        harnesses: [
          harness('claude-code', { configured: true, current: true }),
          harness('codex'),
          harness('cursor', { present: false })
        ]
      }
    })
    render(<OnboardingSiteMcpStep />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install for all my agents' }))
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1))
    // Only the present agent without a current entry; never an agent that is not installed.
    expect(installMock).toHaveBeenCalledWith({ harnessId: 'codex' })
  })

  it('keeps the per-agent rows behind Choose agents', async () => {
    statusMock.mockResolvedValue({
      ok: true,
      value: { serverName: 'muster-sites', command: {}, harnesses: [harness('codex')] }
    })
    render(<OnboardingSiteMcpStep />)
    await screen.findByRole('button', { name: 'Install for all my agents' })
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose agents' }))
    expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument()
  })
})
