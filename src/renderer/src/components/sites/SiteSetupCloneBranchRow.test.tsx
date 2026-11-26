// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteBranchList } from '../../../../shared/remote-branches-api-types'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { allImportToggles, type SiteSetupChoices } from './site-setup-choices'
import { SiteSetupCloneBranchRow } from './SiteSetupCloneBranchRow'

const list = vi.fn<(args: { url: string }) => Promise<RemoteBranchList>>()

function pending(checkoutBranch = 'staging'): PendingSiteBind {
  return {
    requestId: 'r1',
    receivedAt: 0,
    passwordProvided: false,
    candidates: [],
    suggestedCloneUrl: '',
    fields: {
      reponame: 'efront_au/flex',
      hostname: 'host',
      username: 'user',
      rootPath: '',
      liveDomain: '',
      liveDomainProtocol: 'https',
      localDomain: 'flex.local',
      environment: 'staging',
      checkoutBranch,
      deployCommand: '',
      themeDistPath: '',
      notes: ''
    }
  }
}

function choices(cloneBranch?: string): SiteSetupChoices {
  return {
    serve: { enabled: false, stack: null, domain: '' },
    https: false,
    ...(cloneBranch ? { cloneBranch } : {}),
    import: { enabled: true, environment: 'staging', toggles: allImportToggles() }
  }
}

function renderRow(props: Partial<Parameters<typeof SiteSetupCloneBranchRow>[0]> = {}): void {
  render(
    <TooltipProvider>
      <SiteSetupCloneBranchRow
        pending={pending()}
        targetKind="clone"
        cloneUrl="git@bitbucket.org:efront_au/flex.git"
        choices={choices()}
        onChange={() => {}}
        {...props}
      />
    </TooltipProvider>
  )
}

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue({
    ok: true,
    branches: ['main', 'staging', 'feature/x'],
    defaultBranch: 'main'
  })
  ;(window as unknown as { api: unknown }).api = { remoteBranches: { list } }
})

afterEach(() => {
  cleanup()
})

describe('SiteSetupCloneBranchRow', () => {
  it("defaults to the link's branch with no mismatch chip", async () => {
    renderRow()
    await waitFor(() =>
      expect(screen.getByText('staging · will clone staging')).toBeInTheDocument()
    )
    expect(screen.queryByText('Not the staging branch')).not.toBeInTheDocument()
  })

  it('shows the mismatch chip once another branch is picked', async () => {
    renderRow({ choices: choices('feature/x') })
    await waitFor(() => expect(screen.getByText('Not the staging branch')).toBeInTheDocument())
    expect(screen.getByText('staging · will clone feature/x')).toBeInTheDocument()
  })

  it('keeps the branch picker behind the edit button', async () => {
    renderRow()
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change branch' }))
    expect(screen.getByRole('radiogroup', { name: 'Branch to clone' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /staging/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('is unavailable for an existing checkout and never lists branches', () => {
    renderRow({ targetKind: 'existing' })
    expect(screen.getByText('Uses the branch already checked out')).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('says when branches could not be listed and keeps the link branch', async () => {
    list.mockResolvedValue({ ok: false, branches: [], defaultBranch: null })
    renderRow()
    await waitFor(() =>
      expect(
        screen.getByText("staging · will clone staging · Couldn't list branches")
      ).toBeInTheDocument()
    )
  })
})
