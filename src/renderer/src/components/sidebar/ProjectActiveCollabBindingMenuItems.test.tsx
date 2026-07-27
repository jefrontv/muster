// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { ActiveCollabResult } from '../../../../shared/activecollab-api-types'
import type { ActiveCollabProject } from '../../../../shared/activecollab-types'
import type { Project } from '../../../../shared/types'

// Radix's menu needs a live Menu context and layout measurement; the behaviour under test is which
// items this component decides to render and what they write, so the primitives are seams.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: React.ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />
}))

const BINDING = { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }

function musterProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'github:acme/site',
    displayName: 'acme-site',
    badgeColor: '#737373',
    sourceRepoIds: ['repo-site'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

/** The project the app is sitting in. Nothing this component renders may follow it. */
const ACTIVE_PROJECT = musterProject({
  id: 'github:acme/active',
  displayName: 'acme-active',
  sourceRepoIds: ['repo-active'],
  activeCollabBinding: { projectId: 11, projectName: 'Whatever Was Open', boundAt: 1 }
})

const mocks = vi.hoisted(() => ({
  projects: [] as Project[],
  contextKey: '',
  configured: true,
  openModal: vi.fn<(modal: string, data?: Record<string, unknown>) => void>(),
  updateProject: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  listActiveCollabProjects: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabProject[]>>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: mocks.projects,
      settings: null,
      activeCollabStatus: { configured: mocks.configured, connection: null, reason: '' },
      activeCollabStatusContextKey: mocks.contextKey,
      // Present so a regression that starts reading the active workspace has something to read.
      activeWorktreeId: 'wt-active',
      activeRepoId: 'repo-active',
      getKnownWorktreeById: () => ({ projectId: ACTIVE_PROJECT.id, repoId: 'repo-active' }),
      openModal: mocks.openModal,
      updateProject: mocks.updateProject,
      listActiveCollabProjects: mocks.listActiveCollabProjects
    })
}))

import { ProjectActiveCollabBindingMenuItems } from './ProjectActiveCollabBindingMenuItems'

async function renderMenu(repoId = 'repo-site') {
  await act(async () => {
    render(<ProjectActiveCollabBindingMenuItems repoId={repoId} />)
  })
  return { user: userEvent.setup() }
}

beforeEach(() => {
  mocks.projects = [ACTIVE_PROJECT, musterProject()]
  mocks.contextKey = getProviderRuntimeContextKey(null)
  mocks.configured = true
  mocks.openModal.mockReset()
  mocks.updateProject.mockReset()
  mocks.updateProject.mockResolvedValue(true)
  mocks.listActiveCollabProjects.mockReset()
  mocks.listActiveCollabProjects.mockResolvedValue({ ok: true, value: [] })
})

afterEach(cleanup)

describe('ProjectActiveCollabBindingMenuItems', () => {
  it('offers to bind the project whose menu was opened, not the active one', async () => {
    const { user } = await renderMenu()

    await user.click(screen.getByRole('menuitem', { name: 'Bind ActiveCollab project…' }))

    expect(mocks.openModal).toHaveBeenCalledWith('activecollab-bind-project', {
      projectId: 'github:acme/site'
    })
  })

  it('names the bound project and offers to change or unbind it', async () => {
    mocks.projects = [ACTIVE_PROJECT, musterProject({ activeCollabBinding: BINDING })]
    const { user } = await renderMenu()

    expect(screen.getByText('ActiveCollab: Website Rebuild')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Change ActiveCollab project…' }))
    expect(mocks.openModal).toHaveBeenCalledWith('activecollab-bind-project', {
      projectId: 'github:acme/site'
    })
  })

  // The regression this rework exists to prevent: the active workspace has its own binding, and
  // unbinding from another project's menu must not touch it.
  it('unbinds the menu project and leaves the active one alone', async () => {
    mocks.projects = [ACTIVE_PROJECT, musterProject({ activeCollabBinding: BINDING })]
    const { user } = await renderMenu()

    await user.click(screen.getByRole('menuitem', { name: 'Unbind from project' }))

    expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    expect(mocks.updateProject).toHaveBeenCalledWith('github:acme/site', {
      activeCollabBinding: null
    })
  })

  // Disabled with a reason, not hidden: a user who cannot find how binding is done is the bug this
  // entry replaces, and hiding it reproduces that bug for the person most likely to be hunting.
  it('disables binding with a reason while ActiveCollab is disconnected', async () => {
    mocks.configured = false
    await renderMenu()

    expect(screen.getByRole('menuitem', { name: 'Bind ActiveCollab project…' })).toBeDisabled()
    expect(
      screen.getByText('Connect ActiveCollab in Settings to pick a project.')
    ).toBeInTheDocument()
  })

  // Unbind is a local write, so a dead instance is no reason to strand an existing binding.
  it('still unbinds while disconnected', async () => {
    mocks.configured = false
    mocks.projects = [ACTIVE_PROJECT, musterProject({ activeCollabBinding: BINDING })]
    const { user } = await renderMenu()

    await user.click(screen.getByRole('menuitem', { name: 'Unbind from project' }))

    expect(mocks.updateProject).toHaveBeenCalledWith('github:acme/site', {
      activeCollabBinding: null
    })
  })

  // A stale status from another runtime proves nothing about this one.
  it('treats a status read from a different runtime context as disconnected', async () => {
    mocks.contextKey = 'runtime:somewhere-else#0'
    await renderMenu()

    expect(screen.getByRole('menuitem', { name: 'Bind ActiveCollab project…' })).toBeDisabled()
  })

  it('renders nothing for a repo that belongs to no project', async () => {
    await renderMenu('repo-unknown')

    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('costs no ActiveCollab request just to open the menu', async () => {
    mocks.projects = [ACTIVE_PROJECT, musterProject({ activeCollabBinding: BINDING })]
    await renderMenu()

    expect(mocks.listActiveCollabProjects).not.toHaveBeenCalled()
  })
})
