// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabProject } from '../../../shared/activecollab-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveCollabProjectSearchControl } from './task-page-activecollab-project-search'

const listProjects = vi.fn()

beforeEach(() => {
  listProjects.mockReset()
  Object.assign(window, {
    api: {
      activecollab: {
        listProjects
      }
    }
  })
})

afterEach(() => {
  cleanup()
  delete (window as { api?: unknown }).api
})

function project(overrides: Partial<ActiveCollabProject> = {}): ActiveCollabProject {
  return {
    id: 10,
    name: 'TTI Website',
    isCompleted: false,
    openTaskCount: 4,
    ...overrides
  }
}

describe('ActiveCollabProjectSearchControl', () => {
  it('starts as an icon and expands into the project search field', async () => {
    listProjects.mockResolvedValue({
      ok: true,
      value: [project(), project({ id: 11, name: 'Ebes', openTaskCount: 0 })]
    })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <ActiveCollabProjectSearchControl onSelect={onSelect} />
      </TooltipProvider>
    )

    expect(screen.queryByPlaceholderText('Search projects…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Search projects' }))
    expect(screen.getByPlaceholderText('Search projects…')).toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
    })

    await user.click(await screen.findByRole('option', { name: /TTI Website/ }))
    expect(onSelect).toHaveBeenCalledWith({ id: 10, name: 'TTI Website' })
    expect(screen.queryByPlaceholderText('Search projects…')).not.toBeInTheDocument()
  })

  it('hides completed projects from the autocomplete', async () => {
    listProjects.mockResolvedValue({
      ok: true,
      value: [project({ id: 2, name: 'Archived', isCompleted: true })]
    })
    render(
      <TooltipProvider>
        <ActiveCollabProjectSearchControl onSelect={vi.fn()} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Search projects' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByRole('option', { name: /Archived/ })).not.toBeInTheDocument()
    expect(screen.getByText('No matching projects.')).toBeInTheDocument()
  })
})
