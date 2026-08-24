// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { useSyncExternalStore } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { CacheEntry } from '@/store/slices/github'
import type { ActiveCollabTaskPageRows } from '@/store/slices/activecollab-task-patch'
import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../shared/activecollab-types'
import type { ActiveCollabMyWorkFilter } from './task-page-activecollab-my-work-filter'
import type { ActiveCollabTaskPageView } from '@/store/slices/activecollab-task-page-view'

const EMPTY_FILTER: ActiveCollabMyWorkFilter = {
  text: '',
  labelNames: [],
  projectIds: []
}

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const state = {
    listAssignedTasks:
      vi.fn<(args?: { page?: number }) => Promise<ActiveCollabResult<ActiveCollabTaskPageRows>>>(),
    listLabels: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabLabel[]>>>(),
    cache: {} as Record<string, CacheEntry<ActiveCollabTaskPageRows>>,
    settings: { activeRuntimeEnvironmentId: null as string | null },
    collapsedGroups: new Set<string>() as ReadonlySet<string>,
    view: null as ActiveCollabTaskPageView | null,
    // A counter, not the state object: happy-dom re-renders on identity change and a primitive
    // snapshot cannot tear the way a freshly built object would.
    version: 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    bump: (): void => {
      state.version += 1
      for (const listener of listeners) {
        listener()
      }
    },
    /** Mirrors store/slices/ui.ts. */
    toggleCollapsedGroup: vi.fn((key: string) => {
      const next = new Set(state.collapsedGroups)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      state.collapsedGroups = next
      state.bump()
    }),
    /** Mirrors the view slice's `viewBase`: one write changes one member, the rest carry. */
    viewBase: (scope: string): ActiveCollabTaskPageView => {
      const current = state.view
      const matches = current?.scope === scope
      return {
        scope,
        selected: matches ? current.selected : null,
        openProject: matches ? current.openProject : null,
        filter: matches ? current.filter : { text: '', labelNames: [], projectIds: [] }
      }
    },
    setFilter: vi.fn((scope: string, filter: ActiveCollabMyWorkFilter) => {
      state.view = { ...state.viewBase(scope), filter }
      state.bump()
    })
  }
  return state
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
    useSyncExternalStore(mocks.subscribe, () => mocks.version)
    return selector({
      listActiveCollabAssignedTasks: mocks.listAssignedTasks,
      activeCollabTaskPageCache: mocks.cache,
      settings: mocks.settings,
      collapsedGroups: mocks.collapsedGroups,
      toggleCollapsedGroup: mocks.toggleCollapsedGroup,
      activeCollabTaskPageView: mocks.view,
      setActiveCollabTaskPageFilter: mocks.setFilter,
      listActiveCollabLabels: mocks.listLabels
    })
  }
}))

vi.mock('@/components/activecollab-connect-dialog', () => ({
  ActiveCollabConnectDialog: () => null
}))

// The quick-create step reaches straight for the preload bridge to list projects, which no unit
// suite has. The assertion here is that the header opens it at all.
vi.mock('./task-page-activecollab-my-work-create', () => ({
  ActiveCollabMyWorkCreateDialog: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="create-dialog" onClick={onClose}>
      create
    </button>
  )
}))

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveCollabTaskList } from './task-page-activecollab-task-list'

/** Local midnight `offset` days from today — exactly what the codec hands back for a `due_on`. */
function localDay(offset: number): number {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).getTime()
}

const URGENT: ActiveCollabLabel = { id: 11, name: 'URGENT', color: '#ff6600' }
const DOCS: ActiveCollabLabel = { id: 12, name: 'DOCS', color: '#0066ff' }
/** On the instance and on no visible row — the facet must never offer it. */
const STALE: ActiveCollabLabel = { id: 13, name: 'STALE', color: '#999999' }

function taskFixture(overrides: Partial<ActiveCollabTask> = {}): ActiveCollabTask {
  return {
    id: 501,
    projectId: 3790,
    projectName: 'Muster UI',
    taskNumber: 12,
    name: 'Ship the codec',
    bodyHtml: '<p>body</p>',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 42,
    assigneeName: 'Ada Lovelace',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: '/projects/3790/tasks/501',
    taskListId: null,
    isHiddenFromClients: false,
    isImportant: false,
    estimate: null,
    jobTypeId: null,
    openSubtaskCount: null,
    totalSubtaskCount: null,
    ...overrides
  }
}

function servePage(tasks: ActiveCollabTask[]): void {
  const rows: ActiveCollabTaskPageRows = { tasks, hasMore: false, totalItems: null, page: 1 }
  const prefix = getProviderRuntimeContextKey(mocks.settings)
  mocks.cache = { [`${prefix}::tasks::assigned::1`]: { data: rows, fetchedAt: Date.now() } }
  mocks.listAssignedTasks.mockResolvedValue({ ok: true, value: rows })
}

type RenderedList = { onSelect: Mock<(ref: ActiveCollabTaskRef) => void>; user: UserEvent }

async function renderList(): Promise<RenderedList> {
  const onSelect = vi.fn<(ref: ActiveCollabTaskRef) => void>()
  const user = userEvent.setup()
  await act(async () =>
    render(
      <TooltipProvider>
        <ActiveCollabTaskList
          onSelect={onSelect}
          onOpenProject={() => {}}
          onCloseProject={() => {}}
        />
      </TooltipProvider>
    )
  )
  return { onSelect, user }
}

function rowButtons(): HTMLElement[] {
  return screen.getAllByRole('listitem').map((item) => {
    const button = item.querySelector('button')
    if (!button) {
      throw new Error('list row is missing its activation button')
    }
    return button
  })
}

function rowNames(): (string | null)[] {
  return rowButtons().map((row) => row.getAttribute('aria-label'))
}

// Task numbers are deliberately unrelated to both the ids and the due dates, so an ordering
// assertion below can only pass if the list really sorts on the task's own number.
const OVERDUE_ALPHA = taskFixture({
  id: 1,
  name: 'Alpha overdue',
  projectId: 10,
  projectName: 'Alpha',
  taskNumber: 12,
  dueOn: localDay(-3)
})
const TODAY_BETA = taskFixture({
  id: 2,
  name: 'Beta today',
  projectId: 20,
  projectName: 'Beta',
  taskNumber: 8,
  dueOn: localDay(0),
  isImportant: true,
  labels: [DOCS]
})
const TODAY_ALPHA = taskFixture({
  id: 3,
  name: 'Alpha today',
  projectId: 10,
  projectName: 'Alpha',
  taskNumber: 31,
  dueOn: localDay(0),
  labels: [URGENT]
})
const WEEK_ALPHA = taskFixture({
  id: 4,
  name: 'Alpha this week',
  projectId: 10,
  projectName: 'Alpha',
  taskNumber: 63,
  dueOn: localDay(3)
})
const LATER_BETA = taskFixture({
  id: 5,
  name: 'Beta later',
  projectId: 20,
  projectName: 'Beta',
  taskNumber: 55,
  dueOn: localDay(40)
})
const UNDATED_ALPHA = taskFixture({
  id: 6,
  name: 'Alpha someday',
  projectId: 10,
  projectName: 'Alpha',
  taskNumber: 47
})
const EVERY_BUCKET = [LATER_BETA, TODAY_ALPHA, UNDATED_ALPHA, OVERDUE_ALPHA, WEEK_ALPHA, TODAY_BETA]

beforeEach(() => {
  mocks.listAssignedTasks.mockReset()
  mocks.listLabels.mockReset()
  // Seeded so a test can prove the facet ignores it: the vocabulary is no longer the source.
  mocks.listLabels.mockResolvedValue({ ok: true, value: [URGENT, DOCS, STALE] })
  mocks.cache = {}
  mocks.settings = { activeRuntimeEnvironmentId: null }
  mocks.collapsedGroups = new Set<string>()
  mocks.view = null
  mocks.version = 0
  mocks.toggleCollapsedGroup.mockClear()
  mocks.setFilter.mockClear()
})

afterEach(cleanup)

describe('My Work project sections', () => {
  it('files every task under its own project, alphabetically, with no other axis above it', async () => {
    servePage(EVERY_BUCKET)
    await renderList()

    // Level 2 was the due-bucket band. Nothing sits above a project now, so the project heading is
    // the top of the tree.
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    const projects = screen.getAllByRole('heading', { level: 3 })
    expect(projects.map((heading) => heading.textContent)).toEqual(['Alpha4', 'Beta2'])
  })

  it('orders a project by its own task numbers, newest first', async () => {
    servePage(EVERY_BUCKET)
    await renderList()

    // Not the arrival order, not the due order, and not the id order: #63, #47, #31, #12 then
    // #55, #8. This is how the same list reads inside ActiveCollab.
    expect(rowNames()).toEqual([
      expect.stringContaining('Alpha this week'),
      expect.stringContaining('Alpha someday'),
      expect.stringContaining('Alpha today'),
      expect.stringContaining('Alpha overdue'),
      expect.stringContaining('Beta later'),
      expect.stringContaining('Beta today')
    ])
  })

  it('keeps an undated task in its numbered place rather than sinking it', async () => {
    servePage(EVERY_BUCKET)
    await renderList()

    // The old sort pushed undated work to the bottom of the list. #47 has no due date and still
    // sits second in Alpha, because the number is the spine here.
    const alpha = within(screen.getByRole('list', { name: 'Alpha' })).getAllByRole('listitem')
    expect(alpha[1]).toHaveTextContent('Alpha someday')
  })

  it('folds a project away under its own persisted key', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('button', { name: 'Alpha' }))

    expect(mocks.toggleCollapsedGroup).toHaveBeenCalledWith('activecollab-project:10')
    expect(screen.queryByText('Alpha today')).not.toBeInTheDocument()
    // Only that project folded, and its count survives so the user knows what is hidden.
    expect(screen.getByText('Beta today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveTextContent('4')
  })

  it('offers no grouping choice, because there is only one axis left', async () => {
    servePage(EVERY_BUCKET)
    await renderList()

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })
})

describe('My Work filters', () => {
  it('narrows to matching names once the text settles', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.type(screen.getByRole('textbox', { name: /Filter by name/ }), 'later')

    await waitFor(() => expect(rowButtons()).toHaveLength(1))
    expect(rowNames()[0]).toEqual(expect.stringContaining('Beta later'))
    // The header count reports what is on screen, not what the server sent.
    expect(screen.getByTestId('activecollab-my-work-count')).toHaveTextContent('1')
  })

  it('finds a task by number typed with a leading hash', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.type(screen.getByRole('textbox', { name: /Filter by name/ }), '#63')

    await waitFor(() => expect(rowButtons()).toHaveLength(1))
    expect(rowNames()[0]).toEqual(expect.stringContaining('Alpha this week'))
  })

  it('offers only the labels the visible rows actually wear, and never reads the vocabulary', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('combobox', { name: 'Labels' }))

    // DOCS and URGENT are on rows; STALE is on the instance and on nothing here, so offering it
    // would give the user an option that can only ever empty the list.
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['DOCS', 'URGENT'])
    expect(mocks.listLabels).not.toHaveBeenCalled()
  })

  it('paints each label option in its own colour rather than as plain text', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('combobox', { name: 'Labels' }))

    const urgent = await screen.findByRole('option', { name: 'URGENT' })
    const chip = urgent.querySelector('span[style]')
    expect(chip).not.toBeNull()
    expect((chip as HTMLElement).style.backgroundColor).toBe('#ff6600')
  })

  it('narrows to the tasks wearing a picked label', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('combobox', { name: 'Labels' }))
    await user.click(await screen.findByRole('option', { name: 'URGENT' }))

    const prefix = getProviderRuntimeContextKey(mocks.settings)
    expect(mocks.setFilter).toHaveBeenCalledWith(prefix, {
      ...EMPTY_FILTER,
      labelNames: ['URGENT']
    })
    expect(rowButtons()).toHaveLength(1)
    expect(rowNames()[0]).toEqual(expect.stringContaining('Alpha today'))
  })

  it('offers the projects on screen and narrows to the one picked', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('combobox', { name: 'Projects' }))
    await user.click(await screen.findByRole('option', { name: 'Beta' }))

    const prefix = getProviderRuntimeContextKey(mocks.settings)
    expect(mocks.setFilter).toHaveBeenCalledWith(prefix, { ...EMPTY_FILTER, projectIds: [20] })
    await waitFor(() => expect(rowButtons()).toHaveLength(2))
  })

  it('says a filter is hiding everything rather than reusing the unassigned empty state', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.type(screen.getByRole('textbox', { name: /Filter by name/ }), 'nothing matches this')

    await waitFor(() => expect(screen.getByText('No tasks match this filter')).toBeInTheDocument())
    expect(screen.queryByText('No tasks assigned')).not.toBeInTheDocument()
    expect(screen.getByText(/6 tasks are assigned to you/)).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('hides the clear-all until something is actually narrowing the list', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Labels' }))
    await user.click(await screen.findByRole('option', { name: 'URGENT' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    const prefix = getProviderRuntimeContextKey(mocks.settings)
    expect(mocks.setFilter).toHaveBeenLastCalledWith(prefix, EMPTY_FILTER)
    expect(rowButtons()).toHaveLength(6)
  })
})

describe('My Work keyboard navigation', () => {
  it('walks the visible rows with the arrow keys and opens the focused one', async () => {
    servePage(EVERY_BUCKET)
    const { onSelect, user } = await renderList()
    const rows = rowButtons()

    act(() => rows[0].focus())
    await user.keyboard('{ArrowDown}')
    expect(rowButtons()[1]).toHaveFocus()

    await user.keyboard('{ArrowDown}{ArrowUp}')
    expect(rowButtons()[1]).toHaveFocus()

    await user.keyboard('{Enter}')
    // Second row in Alpha is #47, the undated task — the ordering, not the arrival order.
    expect(onSelect).toHaveBeenCalledWith({ projectId: 10, taskId: 6 })
  })

  it('steps over the rows of a collapsed section instead of stalling on them', async () => {
    servePage([OVERDUE_ALPHA, TODAY_ALPHA, TODAY_BETA])
    const { user } = await renderList()

    await user.click(screen.getByRole('button', { name: 'Alpha' }))
    const rows = rowButtons()
    // Both of Alpha's rows went with the heading; only Beta's is left.
    expect(rows).toHaveLength(1)

    act(() => rows[0].focus())
    await user.keyboard('{ArrowDown}')
    expect(rowButtons()[0]).toHaveFocus()
  })

  it('leaves the arrow keys alone at either end so the list can still scroll', async () => {
    servePage([OVERDUE_ALPHA, TODAY_ALPHA])
    await renderList()
    const rows = rowButtons()

    act(() => rows[0].focus())
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    act(() => void rows[0].dispatchEvent(event))
    expect(event.defaultPrevented).toBe(false)
  })

  it('clears the filter on Escape while one is narrowing the list', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    await user.click(screen.getByRole('combobox', { name: 'Labels' }))
    await user.click(await screen.findByRole('option', { name: 'URGENT' }))
    await user.keyboard('{Escape}')
    act(() => rowButtons()[0].focus())
    await user.keyboard('{Escape}')

    const prefix = getProviderRuntimeContextKey(mocks.settings)
    expect(mocks.setFilter).toHaveBeenLastCalledWith(prefix, EMPTY_FILTER)
  })
})

describe('My Work quick create', () => {
  it('opens the create flow from the header', async () => {
    servePage(EVERY_BUCKET)
    const { user } = await renderList()

    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New task' }))

    expect(screen.getByTestId('create-dialog')).toBeInTheDocument()
  })
})
