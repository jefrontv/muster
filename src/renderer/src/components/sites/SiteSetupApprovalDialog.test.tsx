// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupApprovalRequest } from '../../../../shared/site-setup-approval-types'

vi.mock('./use-site-setup-job-toasts', () => ({ useSiteSetupJobToasts: () => {} }))

import { SiteSetupApprovalDialog } from './SiteSetupApprovalDialog'

function card(action: string): SiteSetupApprovalRequest {
  return {
    requestId: `r-${action}`,
    openedAt: 0,
    action,
    title: `Agent wants to ${action}`,
    summary: '',
    details: [],
    siteId: 'site-1',
    siteName: 'acme',
    agent: 'Bob'
  }
}

async function mount(request: SiteSetupApprovalRequest): Promise<ReturnType<typeof vi.fn>> {
  const respond = vi.fn(async () => true)
  Object.assign(window, {
    api: {
      siteSetupApproval: {
        respond,
        listPending: async () => [request],
        onRequest: () => () => {},
        onResolved: () => () => {}
      }
    }
  })
  render(<SiteSetupApprovalDialog />)
  await screen.findByText(request.title)
  return respond
}

afterEach(cleanup)

describe('SiteSetupApprovalDialog always allow', () => {
  it('sends the grant only when ticked, and hides the per-site button while it is', async () => {
    const respond = await mount(card('create_project'))
    expect(screen.getByRole('button', { name: 'Approve for acme' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Always allow without asking/ }))
    expect(screen.queryByRole('button', { name: 'Approve for acme' })).toBeNull()
    expect(screen.getByText(/Creating projects, by any agent, on any site/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({
        requestId: 'r-create_project',
        decision: 'approved',
        alwaysAllow: true
      })
    )
  })

  it('leaves the grant out when the box stays clear or the card is denied', async () => {
    const respond = await mount(card('update_project'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ requestId: 'r-update_project', decision: 'approved' })
    )
  })

  it('offers no grant on a removal', async () => {
    await mount(card('remove_project'))
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
