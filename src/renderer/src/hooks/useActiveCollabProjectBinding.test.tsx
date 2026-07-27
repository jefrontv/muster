// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabProject } from '../../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { Project } from '../../../shared/types'
import type { ActiveCollabProjectBindingController } from './useActiveCollabProjectBinding'

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

const mocks = vi.hoisted(() => ({
  updateProject: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  listActiveCollabProjects: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabProject[]>>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      updateProject: mocks.updateProject,
      listActiveCollabProjects: mocks.listActiveCollabProjects
    })
}))

import { useActiveCollabProjectBinding } from './useActiveCollabProjectBinding'

let controller: ActiveCollabProjectBindingController | null = null
let target: Project | null = null
let verifyOnMount = true

function Probe(): React.JSX.Element {
  const value = useActiveCollabProjectBinding(target, { verifyOnMount })
  controller = value
  return (
    <div>
      <span data-testid="kind">{value.status.kind}</span>
      <span data-testid="error">{value.projectsError ?? ''}</span>
    </div>
  )
}

function upstream(id: number, name: string): ActiveCollabProject {
  return { id, name, isCompleted: false, openTaskCount: null }
}

async function renderProbe(): Promise<void> {
  await act(async () => {
    render(<Probe />)
  })
}

beforeEach(() => {
  controller = null
  target = musterProject()
  verifyOnMount = true
  mocks.updateProject.mockReset()
  mocks.updateProject.mockResolvedValue(true)
  mocks.listActiveCollabProjects.mockReset()
  mocks.listActiveCollabProjects.mockResolvedValue({ ok: true, value: [] })
})

afterEach(cleanup)

describe('useActiveCollabProjectBinding', () => {
  it('leaves an unbound project alone and fetches nothing until the picker asks', async () => {
    await renderProbe()

    expect(screen.getByTestId('kind')).toHaveTextContent('unbound')
    expect(mocks.listActiveCollabProjects).not.toHaveBeenCalled()

    await act(async () => {
      controller?.ensureProjects()
    })

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)
  })

  it('verifies a stored binding against the instance on mount', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: true,
      value: [upstream(3790, 'Website Rebuild')]
    })

    await renderProbe()

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('kind')).toHaveTextContent('bound')
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  // ActiveCollab has no change feed, so a rename is only ever discovered by comparing the cached
  // name against a fresh list. The write-back is what stops the stale name persisting forever.
  it('writes back the display name after an upstream rename', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: true,
      value: [upstream(3790, 'Website Rebuild 2026')]
    })

    await renderProbe()

    expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    expect(mocks.updateProject).toHaveBeenCalledWith('github:acme/site', {
      activeCollabBinding: {
        projectId: 3790,
        projectName: 'Website Rebuild 2026',
        // The original bind time survives the rename: it records when the user chose the project.
        boundAt: 1700
      }
    })
  })

  it('reports a vanished project without touching the stored binding', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    mocks.listActiveCollabProjects.mockResolvedValue({ ok: true, value: [upstream(1, 'Other')] })

    await renderProbe()

    expect(screen.getByTestId('kind')).toHaveTextContent('missing')
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  // A failed read is not evidence the project is gone; treating it as such would accuse a healthy
  // binding of being broken every time the instance blips.
  it('keeps a binding unverified when the projects read fails', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: false,
      kind: 'unknown',
      error: 'socket hang up',
      status: null
    })

    await renderProbe()

    expect(screen.getByTestId('kind')).toHaveTextContent('unverified')
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Could not reach ActiveCollab: socket hang up'
    )
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  // Regression: the mount effect once re-derived "should I load?" from the load state, so a
  // failure — which leaves `projects` null — re-fired the effect on its own state change and
  // hammered the instance in a tight loop. Verification is one-shot; recovery is user-initiated.
  it('does not retry a failed verification on its own, but the picker can', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: false,
      kind: 'unknown',
      error: 'socket hang up',
      status: null
    })

    await renderProbe()
    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)

    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: true,
      value: [upstream(3790, 'Website Rebuild')]
    })
    await act(async () => {
      controller?.ensureProjects()
    })

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('kind')).toHaveTextContent('bound')
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('does not refetch the project list once it has loaded cleanly', async () => {
    mocks.listActiveCollabProjects.mockResolvedValue({
      ok: true,
      value: [upstream(3790, 'Website Rebuild')]
    })
    await renderProbe()

    await act(async () => {
      controller?.ensureProjects()
    })
    await act(async () => {
      controller?.ensureProjects()
    })

    expect(mocks.listActiveCollabProjects).toHaveBeenCalledTimes(1)
  })

  it('binds the chosen project to the target it was handed', async () => {
    await renderProbe()

    await act(async () => {
      controller?.bind(upstream(4100, 'Zebra Migration'))
    })

    const [projectId, updates] = mocks.updateProject.mock.calls[0] ?? []
    expect(projectId).toBe('github:acme/site')
    expect(updates).toMatchObject({
      activeCollabBinding: { projectId: 4100, projectName: 'Zebra Migration' }
    })
  })

  it('clears with an explicit null so the unbind cannot be read as "leave it alone"', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    await renderProbe()

    await act(async () => {
      controller?.clear()
    })

    expect(mocks.updateProject).toHaveBeenCalledWith('github:acme/site', {
      activeCollabBinding: null
    })
  })

  it('writes nothing when the caller has no Muster project in scope', async () => {
    target = null
    await renderProbe()

    expect(controller?.targetProject).toBeNull()
    await act(async () => {
      controller?.bind(upstream(4100, 'Zebra Migration'))
      controller?.clear()
    })

    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  // The sidebar's ⋯ menu only reports the persisted name and offers unbind, so opening it must not
  // spend an ActiveCollab request. The write path is still the shared one.
  it('skips the mount verification when the caller opts out', async () => {
    target = musterProject({ activeCollabBinding: BINDING })
    verifyOnMount = false

    await renderProbe()

    expect(mocks.listActiveCollabProjects).not.toHaveBeenCalled()
    expect(screen.getByTestId('kind')).toHaveTextContent('unverified')
  })

  // The whole point of the rework: a binding lands on the project the caller named, not on
  // whatever the app happens to be pointed at.
  it('writes to the handed target even when it is not the one the app is showing', async () => {
    target = musterProject({ id: 'github:acme/charlotte', displayName: '201-charlotte' })
    await renderProbe()

    await act(async () => {
      controller?.bind(upstream(4100, 'Zebra Migration'))
    })

    expect(mocks.updateProject).toHaveBeenCalledTimes(1)
    expect(mocks.updateProject.mock.calls[0]?.[0]).toBe('github:acme/charlotte')
  })
})
