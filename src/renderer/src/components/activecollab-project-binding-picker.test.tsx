// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabProject } from '../../../shared/activecollab-types'

// Radix's popover is stubbed so the content always renders: the behaviour under test is this
// component's own filtering and open-callback wiring, not Radix's portal. `Popover` exposes a
// button for the open transition, which is otherwise only reachable through Radix's trigger.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    onOpenChange
  }: {
    children: React.ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (
    <div>
      <button type="button" data-testid="open-picker" onClick={() => onOpenChange?.(true)} />
      {children}
    </div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: React.forwardRef<
    HTMLInputElement,
    { value?: string; placeholder?: string; onValueChange?: (value: string) => void }
  >(({ onValueChange, ...props }, ref) => (
    <input
      ref={ref}
      aria-label="project search"
      {...props}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  )),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

import { ActiveCollabProjectPicker } from './activecollab-project-binding-picker'

function acProject(id: number, name: string, isCompleted = false): ActiveCollabProject {
  return { id, name, isCompleted, openTaskCount: null }
}

const PROJECTS = [
  acProject(4100, 'Zebra Migration'),
  acProject(3790, 'Website Rebuild'),
  acProject(3791, 'website archive', true),
  acProject(2200, 'Acme Intranet')
]

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof ActiveCollabProjectPicker>> = {}
) {
  const onSelect = vi.fn()
  const onOpen = vi.fn()
  render(
    <ActiveCollabProjectPicker
      projects={PROJECTS}
      loading={false}
      errorMessage={null}
      selectedProjectId={null}
      label="Bind project"
      onOpen={onOpen}
      onSelect={onSelect}
      {...overrides}
    />
  )
  return { onSelect, onOpen, user: userEvent.setup() }
}

function optionNames(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent?.trim() ?? '')
}

afterEach(cleanup)

describe('ActiveCollabProjectPicker', () => {
  it('filters the options by name, case-insensitively', async () => {
    const { user } = renderPicker()

    await user.type(screen.getByLabelText('project search'), 'website')

    expect(optionNames()).toEqual(['Website Rebuild', 'website archiveCompleted'])
  })

  it('shows a no-match message rather than an empty list', async () => {
    const { user } = renderPicker()

    await user.type(screen.getByLabelText('project search'), 'nothing here')

    expect(optionNames()).toEqual([])
    expect(screen.getByText('No ActiveCollab projects match your search.')).toBeInTheDocument()
  })

  // Sixty projects on the target instance: alphabetical is the only order a human can scan, and a
  // completed project is never what someone is reaching for.
  it('orders open projects alphabetically ahead of completed ones', () => {
    renderPicker()

    expect(optionNames()).toEqual([
      'Acme Intranet',
      'Website Rebuild',
      'Zebra Migration',
      'website archiveCompleted'
    ])
  })

  it('reports the chosen project to the caller', async () => {
    const { onSelect, user } = renderPicker()

    await user.click(screen.getByRole('option', { name: /Website Rebuild/ }))

    expect(onSelect).toHaveBeenCalledWith(acProject(3790, 'Website Rebuild'))
  })

  it('marks the currently bound project as selected', () => {
    renderPicker({ selectedProjectId: 3790 })

    expect(screen.getByRole('option', { name: /Website Rebuild/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Zebra Migration/ })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  // The caller fetches lazily, so an unbound user pays nothing until the picker is opened.
  it('asks the caller to load projects when it opens', async () => {
    const { onOpen, user } = renderPicker({ projects: null })

    expect(onOpen).not.toHaveBeenCalled()
    await user.click(screen.getByTestId('open-picker'))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed projects read instead of claiming there are none', () => {
    renderPicker({ projects: null, errorMessage: 'Could not reach ActiveCollab: socket hang up' })

    expect(screen.getByText('Could not reach ActiveCollab: socket hang up')).toBeInTheDocument()
    expect(
      screen.queryByText('No ActiveCollab projects match your search.')
    ).not.toBeInTheDocument()
  })
})
