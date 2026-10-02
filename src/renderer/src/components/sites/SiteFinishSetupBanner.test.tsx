// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSummary } from '../../../../shared/site-types'
import { useAppStore } from '@/store'
import { SiteFinishSetupBanner } from './SiteFinishSetupBanner'

const planMock = vi.fn()

function summary(environments: Record<string, unknown> = {}): SiteSummary {
  return {
    pathExists: true,
    site: {
      id: 's1',
      displayName: 'Flex',
      localDomain: '',
      localStack: 'plain',
      environments
    }
  } as unknown as SiteSummary
}

function stack(alternatives: string[]): unknown {
  return { ok: true, value: { stack: { supported: true, stack: 'plain', alternatives } } }
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  planMock.mockReset()
  ;(window as unknown as { api: unknown }).api = { siteSetup: { plan: planMock } }
})

afterEach(() => {
  cleanup()
})

describe('SiteFinishSetupBanner', () => {
  it('says nothing can serve the site when no stack is installed', async () => {
    planMock.mockResolvedValue(stack([]))
    render(<SiteFinishSetupBanner summary={summary()} />)
    expect(
      await screen.findByText('Nothing can serve this site yet. Install a local stack to run it.')
    ).toBeInTheDocument()
  })

  it('offers Add environment for a served site with no server details', async () => {
    planMock.mockResolvedValue({
      ok: true,
      value: { stack: { supported: true, stack: 'ddev', alternatives: [] } }
    })
    const onAddEnvironment = vi.fn()
    render(
      <SiteFinishSetupBanner
        summary={{ ...summary(), site: { ...summary().site, localStack: 'ddev' } } as SiteSummary}
        onAddEnvironment={onAddEnvironment}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Add environment' }))
    expect(onAddEnvironment).toHaveBeenCalledTimes(1)
  })
})
