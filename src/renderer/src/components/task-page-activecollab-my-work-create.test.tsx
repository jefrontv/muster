// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { ActiveCollabProjectTasks } from '../../../shared/activecollab-types'

const mocks = vi.hoisted(() => ({
  listProjectTasks: vi.fn(),
  createTask: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { activeRuntimeEnvironmentId: null } })
}))

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabListProjectTasks: mocks.listProjectTasks,
  activeCollabCreateTask: mocks.createTask
}))

// The catalog reaches for the preload bridge, and the create form is the project view's own,
// already covered there. Both are stood in so the assertions stay on the project STEP.
vi.mock('@/components/activecollab-project-picker', () => ({
  useActiveCollabProjectCatalog: (enabled: boolean) => ({
    projects: enabled ? [{ id: 7, name: 'Muster UI', isCompleted: false, openTaskCount: 3 }] : null
  }),
  ActiveCollabProjectCommandList: ({
    onSelect
  }: {
    onSelect: (project: { id: number; name: string }) => void
  }) => (
    <button type="button" onClick={() => onSelect({ id: 7, name: 'Muster UI' })}>
      pick Muster UI
    </button>
  )
}))

vi.mock('./activecollab-task-create-dialog', () => ({
  ActiveCollabTaskCreateDialog: ({
    projectId,
    taskLists,
    onCreate
  }: {
    projectId: number
    taskLists: readonly { id: number; name: string }[]
    onCreate: (args: {
      taskListId: number | null
      update: { name: string }
      attachmentCodes: string[]
    }) => Promise<unknown>
  }) => (
    <button
      type="button"
      data-testid="create-form"
      data-project-id={projectId}
      data-lists={taskLists.map((list) => list.name).join(',')}
      onClick={() =>
        void onCreate({ taskListId: 42, update: { name: 'Ship it' }, attachmentCodes: [] })
      }
    >
      form
    </button>
  )
}))

import { ActiveCollabMyWorkCreateDialog } from './task-page-activecollab-my-work-create'

const PROJECT_TASKS: ActiveCollabProjectTasks = {
  projectId: 7,
  tasks: [],
  taskLists: [{ id: 42, name: 'Inbox' }]
}

beforeEach(() => {
  mocks.listProjectTasks.mockReset()
  mocks.listProjectTasks.mockResolvedValue({ ok: true, value: PROJECT_TASKS })
  mocks.createTask.mockReset()
  mocks.createTask.mockResolvedValue({ ok: true, value: null })
})

afterEach(cleanup)

type RenderedDialog = {
  onClose: Mock<() => void>
  onCreated: Mock<() => void>
  user: UserEvent
}

async function renderDialog(): Promise<RenderedDialog> {
  const onClose = vi.fn<() => void>()
  const onCreated = vi.fn<() => void>()
  const user = userEvent.setup()
  await act(async () =>
    render(
      <ActiveCollabMyWorkCreateDialog
        onClose={onClose}
        onCreated={onCreated}
        sourceContext={null}
      />
    )
  )
  return { onClose, onCreated, user }
}

describe('ActiveCollabMyWorkCreateDialog', () => {
  it('asks for a project first, then hands the form that project and its lists', async () => {
    const { user } = await renderDialog()

    // Nothing is read until a project is chosen: the task lists belong to one project.
    expect(screen.queryByTestId('create-form')).not.toBeInTheDocument()
    expect(mocks.listProjectTasks).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'pick Muster UI' }))

    const form = await screen.findByTestId('create-form')
    expect(mocks.listProjectTasks).toHaveBeenCalledWith({ projectId: 7 }, expect.anything())
    expect(form).toHaveAttribute('data-project-id', '7')
    expect(form).toHaveAttribute('data-lists', 'Inbox')
  })

  it('creates against the chosen project and reports back so the list can refetch', async () => {
    const { onCreated, user } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'pick Muster UI' }))
    await user.click(await screen.findByTestId('create-form'))

    expect(mocks.createTask).toHaveBeenCalledWith(
      {
        projectId: 7,
        taskListId: 42,
        update: { name: 'Ship it' },
        attachmentCodes: []
      },
      expect.anything()
    )
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it('leaves the user a way back when the project read fails', async () => {
    mocks.listProjectTasks.mockResolvedValue({
      ok: false,
      kind: 'network',
      error: 'ECONNRESET',
      status: 0
    })
    const { user } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'pick Muster UI' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach ActiveCollab. Check your internet connection and try again.'
    )
    await user.click(screen.getByRole('button', { name: 'Choose another project' }))

    expect(screen.getByRole('button', { name: 'pick Muster UI' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a failed create on the form instead of claiming the task landed', async () => {
    mocks.createTask.mockResolvedValue({ ok: false, kind: 'api', error: 'refused', status: 400 })
    const { onCreated, user } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'pick Muster UI' }))
    await user.click(await screen.findByTestId('create-form'))

    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByTestId('create-form')).toBeInTheDocument()
  })
})
