// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabResult } from '../../../../shared/activecollab-api-types'
import type { ActiveCollabProject } from '../../../../shared/activecollab-types'
import type { Project } from '../../../../shared/types'

// Radix's dialog portals and traps focus; neither is what this file is about.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>
}))

// cmdk owns focus and scroll behaviour the picker suite already covers.
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: React.forwardRef<HTMLInputElement, { placeholder?: string }>((props, ref) => (
    <input ref={ref} aria-label="project search" placeholder={props.placeholder} />
  )),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

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

/** The project the app is sitting in, with a binding of its own that must survive untouched. */
const ACTIVE_PROJECT = musterProject({
  id: 'github:acme/active',
  displayName: 'acme-active',
  sourceRepoIds: ['repo-active'],
  activeCollabBinding: { projectId: 11, projectName: 'Whatever Was Open', boundAt: 1 }
})

const TARGET_PROJECT = musterProject({
  id: 'github:acme/charlotte',
  displayName: '201-charlotte',
  sourceRepoIds: ['repo-charlotte']
})

function upstream(id: number, name: string): ActiveCollabProject {
  return { id, name, isCompleted: false, openTaskCount: null }
}

const mocks = vi.hoisted(() => ({
  activeModal: 'activecollab-bind-project',
  modalData: {} as Record<string, unknown>,
  projects: [] as Project[],
  closeModal: vi.fn(),
  updateProject: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  listActiveCollabProjects: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabProject[]>>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeModal: mocks.activeModal,
      modalData: mocks.modalData,
      projects: mocks.projects,
      closeModal: mocks.closeModal,
      updateProject: mocks.updateProject,
      listActiveCollabProjects: mocks.listActiveCollabProjects
    })
}))

import ActiveCollabBindProjectDialog from './ActiveCollabBindProjectDialog'

async function renderDialog() {
  await act(async () => {
    render(<ActiveCollabBindProjectDialog />)
  })
  return { user: userEvent.setup() }
}

beforeEach(() => {
  mocks.activeModal = 'activecollab-bind-project'
  mocks.modalData = { projectId: TARGET_PROJECT.id }
  mocks.projects = [ACTIVE_PROJECT, TARGET_PROJECT]
  mocks.closeModal.mockReset()
  mocks.updateProject.mockReset()
  mocks.updateProject.mockResolvedValue(true)
  mocks.listActiveCollabProjects.mockReset()
  mocks.listActiveCollabProjects.mockResolvedValue({
    ok: true,
    value: [upstream(4100, 'Zebra Migration'), upstream(3790, 'Website Rebuild')]
  })
})

afterEach(cleanup)

describe('ActiveCollabBindProjectDialog', () => {
  it('names the Muster project it is about to scope', async () => {
    await renderDialog()

    expect(
      screen.getByText('Tasks shown for 201-charlotte will be narrowed to the project you pick.')
    ).toBeInTheDocument()
  })

  // The whole rework: the dialog was opened from 201-charlotte's menu while the app sits in
  // acme-active, and the write lands on 201-charlotte.
  it('binds the project it was opened for, leaving the active workspace untouched', async () => {
    const { user } = await renderDialog()

    await user.click(screen.getByRole('option', { name: /Website Rebuild/ }))

    expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    const [projectId, updates] = mocks.updateProject.mock.calls[0] ?? []
    expect(projectId).toBe('github:acme/charlotte')
    expect(updates).toMatchObject({
      activeCollabBinding: { projectId: 3790, projectName: 'Website Rebuild' }
    })
    expect(mocks.closeModal).toHaveBeenCalledTimes(1)
  })

  it('loads the instance project list once when it opens', async () => {
    await renderDialog()

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('option', { name: /Zebra Migration/ })).toBeInTheDocument()
  })

  it('marks the existing binding and offers to move it', async () => {
    mocks.projects = [
      ACTIVE_PROJECT,
      musterProject({
        ...TARGET_PROJECT,
        activeCollabBinding: { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }
      })
    ]
    await renderDialog()

    expect(
      screen.getByText(
        '201-charlotte currently shows tasks from Website Rebuild. Pick a different project to move it.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Website Rebuild/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  // One-shot on mount, because `ensureProjects` retries a failed read by design and an effect keyed
  // on its identity would loop against a broken instance.
  it('reports a failed read once and retries only on request', async () => {
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: false,
      kind: 'unknown',
      error: 'socket hang up',
      status: null
    })
    const { user } = await renderDialog()

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Could not reach ActiveCollab: socket hang up')).toBeInTheDocument()

    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: true,
      value: [upstream(1, 'Recovered')]
    })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('option', { name: /Recovered/ })).toBeInTheDocument()
  })

  it('renders nothing when another modal owns the screen', async () => {
    mocks.activeModal = 'worktree-visibility'
    await renderDialog()

    expect(screen.queryByLabelText('project search')).not.toBeInTheDocument()
    expect(mocks.listActiveCollabProjects).not.toHaveBeenCalled()
  })

  it('renders nothing when the named project no longer exists', async () => {
    mocks.modalData = { projectId: 'github:acme/deleted' }
    await renderDialog()

    expect(screen.queryByLabelText('project search')).not.toBeInTheDocument()
  })
})
