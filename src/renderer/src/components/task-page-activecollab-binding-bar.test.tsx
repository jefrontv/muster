// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabProjectBindingController } from '@/hooks/useActiveCollabProjectBinding'
import type { Project } from '../../../shared/types'

// The picker has its own suite; here it is a seam that reports the label and selection the bar
// hands it, so this file only asserts what the bar decides.
const pickerProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('@/components/activecollab-project-binding-picker', () => ({
  ActiveCollabProjectPicker: (props: Record<string, unknown>) => {
    pickerProps.current = props
    return (
      <button
        type="button"
        data-testid="project-picker"
        data-selected={String(props.selectedProjectId)}
      >
        {String(props.label)}
      </button>
    )
  }
}))

import { ActiveCollabProjectBindingBar } from './task-page-activecollab-binding-bar'

const BINDING = { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }

const MUSTER_PROJECT: Project = {
  id: 'github:acme/site',
  displayName: 'acme-site',
  badgeColor: '#737373',
  sourceRepoIds: ['repo-site'],
  createdAt: 1,
  updatedAt: 1
}

function renderBar(overrides: Partial<ActiveCollabProjectBindingController> = {}) {
  const bind = vi.fn()
  const clear = vi.fn()
  const ensureProjects = vi.fn()
  render(
    <ActiveCollabProjectBindingBar
      targetProject={MUSTER_PROJECT}
      status={{ kind: 'unbound' }}
      projects={null}
      projectsLoading={false}
      projectsError={null}
      ensureProjects={ensureProjects}
      bind={bind}
      clear={clear}
      {...overrides}
    />
  )
  return { bind, clear, ensureProjects, user: userEvent.setup() }
}

afterEach(() => {
  pickerProps.current = null
  cleanup()
})

describe('ActiveCollabProjectBindingBar', () => {
  it('says the list is unscoped and names the project its shortcut will bind', () => {
    renderBar()

    expect(
      screen.getByText(
        'Nothing is scoping this list — showing every task assigned to you. Bind acme-site here, or from its ⋯ menu in the sidebar.'
      )
    ).toBeInTheDocument()
    // The shortcut writes to the active workspace's project, so it has to say which one that is.
    expect(screen.getByTestId('project-picker')).toHaveTextContent('Bind acme-site…')
    expect(screen.getByTestId('project-picker')).toHaveAttribute('data-selected', 'null')
    // Nothing to clear yet.
    expect(screen.queryByRole('button', { name: 'Show all tasks' })).not.toBeInTheDocument()
  })

  it('names the project in the shortcut even when it is not the one the bar was last on', () => {
    renderBar({ targetProject: { ...MUSTER_PROJECT, displayName: '201-charlotte' } })

    expect(screen.getByTestId('project-picker')).toHaveTextContent('Bind 201-charlotte…')
  })

  it('names both sides of a live binding and offers to clear it', () => {
    renderBar({ status: { kind: 'bound', binding: BINDING, upstreamName: 'Website Rebuild' } })

    expect(screen.getByText('acme-site is showing tasks from Website Rebuild.')).toBeInTheDocument()
    expect(screen.getByTestId('project-picker')).toHaveTextContent('Change project')
    expect(screen.getByTestId('project-picker')).toHaveAttribute('data-selected', '3790')
    expect(screen.getByRole('button', { name: 'Show all tasks' })).toBeInTheDocument()
  })

  it('shows the upstream name immediately after a rename', () => {
    renderBar({ status: { kind: 'bound', binding: BINDING, upstreamName: 'Website Rebuild 2026' } })

    expect(
      screen.getByText('acme-site is showing tasks from Website Rebuild 2026.')
    ).toBeInTheDocument()
  })

  it('falls back to the persisted name while the binding is unverified', () => {
    renderBar({ status: { kind: 'unverified', binding: BINDING } })

    expect(screen.getByText('acme-site is showing tasks from Website Rebuild.')).toBeInTheDocument()
  })

  // The degraded path: the list underneath is empty, and this bar is the only thing that explains
  // why and the only route back out.
  it('explains a vanished project and keeps both recovery routes reachable', async () => {
    const { clear, user } = renderBar({ status: { kind: 'missing', binding: BINDING } })

    expect(
      screen.getByText(
        'Website Rebuild is no longer available in ActiveCollab. Pick another project, or show every assigned task.'
      )
    ).toBeInTheDocument()
    expect(screen.getByTestId('project-picker')).toHaveTextContent('Change project')

    await user.click(screen.getByRole('button', { name: 'Show all tasks' }))
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('hands the picker the caller-supplied bind action', () => {
    const { bind } = renderBar()

    expect(pickerProps.current?.onSelect).toBe(bind)
  })

  it('asks for a workspace instead of a picker when no Muster project is in scope', () => {
    renderBar({ targetProject: null })

    expect(
      screen.getByText('Open a workspace to bind an ActiveCollab project to it.')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('project-picker')).not.toBeInTheDocument()
  })
})
