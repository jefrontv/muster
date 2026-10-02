// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import { SiteSetupLinkTargetRows } from './SiteSetupLinkTargetRows'

const pickDirectory = vi.fn<() => Promise<string | null>>()

function pending(overrides: Partial<PendingSiteBind> = {}): PendingSiteBind {
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
      environment: '',
      checkoutBranch: '',
      deployCommand: '',
      themeDistPath: '',
      notes: ''
    },
    ...overrides
  }
}

beforeEach(() => {
  pickDirectory.mockReset()
  ;(window as unknown as { api: unknown }).api = { repos: { pickDirectory } }
})

afterEach(() => {
  cleanup()
})

describe('SiteSetupLinkTargetRows', () => {
  it('clones into a folder the user picks when no projects folder exists yet', async () => {
    pickDirectory.mockResolvedValue('/Users/tester/Work')
    const onChange = vi.fn()
    render(
      <SiteSetupLinkTargetRows
        pending={pending()}
        primaryRoot=""
        cloneUrl="git@bitbucket.org:efront_au/flex.git"
        value={null}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: /Clone into a folder/ }))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ kind: 'clone', root: '/Users/tester/Work' })
    )
  })

  it('names the fix when Bitbucket is not connected, instead of blaming the folder', () => {
    const onOpenIntegrations = vi.fn()
    render(
      <SiteSetupLinkTargetRows
        pending={pending()}
        primaryRoot=""
        cloneUrl=""
        value={null}
        onChange={() => {}}
        cloneProblem={{ kind: 'no-connector', error: '' }}
        onOpenIntegrations={onOpenIntegrations}
      />
    )
    expect(screen.getByText('Connect Bitbucket to clone this repository.')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Clone into a folder/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Integrations' }))
    expect(onOpenIntegrations).toHaveBeenCalledTimes(1)
  })

  it('still offers an existing checkout', () => {
    render(
      <SiteSetupLinkTargetRows
        pending={pending()}
        primaryRoot=""
        cloneUrl=""
        value={null}
        onChange={() => {}}
      />
    )
    expect(screen.getByRole('radio', { name: /Use an existing checkout/ })).toBeInTheDocument()
  })
})
