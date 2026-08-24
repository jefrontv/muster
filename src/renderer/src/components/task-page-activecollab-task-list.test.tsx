// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { useSyncExternalStore } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { CacheEntry } from '@/store/slices/github'
import type { ActiveCollabTaskPageRows } from '@/store/slices/activecollab-task-patch'
import type { ActiveCollabTaskPageView } from '@/store/slices/activecollab-task-page-view'
import type {
  ActiveCollabFailure,
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../shared/activecollab-types'

type ListResult = ActiveCollabResult<ActiveCollabTaskPageRows>
type RenderedList = {
  onSelect: Mock<(ref: ActiveCollabTaskRef) => void>
  user: UserEvent
  rerender: () => Promise<void>
}

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }
  const state = {
    listAssignedTasks:
      vi.fn<
        (
          args?: { page?: number },
          options?: { force?: boolean }
        ) => Promise<ActiveCollabResult<ActiveCollabTaskPageRows>>
      >(),
    cache: {} as Record<string, CacheEntry<ActiveCollabTaskPageRows>>,
    settings: { activeRuntimeEnvironmentId: null as string | null },
    // The sidebar's shared collapse set. Membership means collapsed, absence means expanded.
    collapsedGroups: new Set<string>() as ReadonlySet<string>,
    // This file covers project grouping, row content, paging and project collapse — all
    // project-mode concerns — so the view is pinned there. My Work's date buckets (the production
    // default) and its filters live in task-page-activecollab-my-work.test.tsx.
    view: null as ActiveCollabTaskPageView | null,
    /** Everything the real ui slice would have handed to `window.api.ui.set`, in order. */
    persistedCollapsedGroups: [] as string[][],
    subscribeCollapsedGroups: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Stands in for a set restored from disk at launch. */
    restoreCollapsedGroups: (keys: string[]): void => {
      state.collapsedGroups = new Set(keys)
      emit()
    },
    // Mirrors store/slices/ui.ts: swap in a fresh Set, then write it through to persistence.
    toggleCollapsedGroup: vi.fn((key: string) => {
      const next = new Set(state.collapsedGroups)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      state.collapsedGroups = next
      state.persistedCollapsedGroups.push([...next])
      emit()
    })
  }
  return state
})

// Reactive only where the component needs it: collapse is the one field a click has to push back
// into a re-render, so it goes through useSyncExternalStore while the rest stay plain reads.
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
    const collapsedGroups = useSyncExternalStore(
      mocks.subscribeCollapsedGroups,
      () => mocks.collapsedGroups
    )
    return selector({
      listActiveCollabAssignedTasks: mocks.listAssignedTasks,
      activeCollabTaskPageCache: mocks.cache,
      settings: mocks.settings,
      collapsedGroups,
      toggleCollapsedGroup: mocks.toggleCollapsedGroup,
      activeCollabTaskPageView: mocks.view
    })
  }
}))

// The real dialog portals through Radix; a stand-in keeps the assertion on whether the list opened
// the connect path at all.
vi.mock('@/components/activecollab-connect-dialog', () => ({
  ActiveCollabConnectDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="connect-dialog" /> : null
}))

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { activeCollabGroupCollapseKey } from './task-page-activecollab-group-collapse'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveCollabTaskList } from './task-page-activecollab-task-list'

function dueLabel(dueOn: number): string {
  return new Date(dueOn).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Local midnight on 14 Mar 2026 — exactly what the codec hands back for a `due_on` of that day.
const DUE_ON = new Date(2026, 2, 14).getTime()
// Pinned either side of any possible "now", so the overdue/upcoming split never depends on the
// wall clock the suite happens to run at.
const FUTURE_DUE_ON = new Date(2099, 2, 14).getTime()
const DUE_LABEL = dueLabel(DUE_ON)
const FUTURE_DUE_LABEL = dueLabel(FUTURE_DUE_ON)

const URGENT: ActiveCollabLabel = { id: 11, name: 'URGENT', color: '#ff6600' }
const UNCOLOURED: ActiveCollabLabel = { id: 12, name: 'backlog', color: null }

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

function pageRows(
  page: number,
  tasks: ActiveCollabTask[],
  hasMore: boolean
): ActiveCollabTaskPageRows {
  return { tasks, hasMore, totalItems: null, page }
}

/** Writes the page into the mocked cache under the live scope, exactly as the slice does. */
function servePage(rows: ActiveCollabTaskPageRows): ListResult {
  const prefix = getProviderRuntimeContextKey(mocks.settings)
  mocks.cache = {
    ...mocks.cache,
    [`${prefix}::tasks::assigned::${rows.page}`]: { data: rows, fetchedAt: Date.now() }
  }
  return { ok: true, value: rows }
}

function servePages(...pages: ActiveCollabTaskPageRows[]): void {
  mocks.listAssignedTasks.mockImplementation(async (args) => {
    const wanted = args?.page ?? 1
    const rows = pages.find((candidate) => candidate.page === wanted)
    return rows ? servePage(rows) : { ok: false, kind: 'api', error: 'no such page', status: 404 }
  })
}

function serveFailure(kind: ActiveCollabFailure['kind'], error = 'gateway down'): void {
  mocks.listAssignedTasks.mockResolvedValue({ ok: false, kind, error, status: 502 })
}

async function renderList(selectedTaskId: number | null = null): Promise<RenderedList> {
  const onSelect = vi.fn<(ref: ActiveCollabTaskRef) => void>()
  const user = userEvent.setup()
  // A fresh element each time: React bails out of re-rendering an identical element reference,
  // which would silently hide the scope change under test.
  const element = (): React.JSX.Element => (
    <TooltipProvider>
      {/* onOpenProject always present in production (the panel owns the drill-in), so the
          heading's drill-in button is part of the real tab order under test. */}
      <ActiveCollabTaskList
        onSelect={onSelect}
        selectedTaskId={selectedTaskId}
        onOpenProject={() => {}}
        onCloseProject={() => {}}
      />
    </TooltipProvider>
  )
  const view = await act(async () => render(element()))
  return {
    onSelect,
    user,
    rerender: async () => {
      await act(async () => {
        view.rerender(element())
      })
    }
  }
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

/** The heading's toggle, addressed the way a user reaches it: by the project name. */
function groupToggle(projectName: string): HTMLElement {
  return screen.getByRole('button', { name: projectName })
}

beforeEach(() => {
  mocks.listAssignedTasks.mockReset()
  mocks.cache = {}
  mocks.settings = { activeRuntimeEnvironmentId: null }
  mocks.collapsedGroups = new Set<string>()
  mocks.persistedCollapsedGroups = []
  mocks.view = {
    scope: getProviderRuntimeContextKey(mocks.settings),
    selected: null,
    openProject: null,
    filter: { text: '', labelNames: [], projectIds: [] }
  }
  mocks.toggleCollapsedGroup.mockClear()
})

afterEach(cleanup)

describe('ActiveCollabTaskList load states', () => {
  it('shows the skeleton and nothing else while the first page is in flight', async () => {
    mocks.listAssignedTasks.mockReturnValue(new Promise<ListResult>(() => {}))
    await renderList()

    expect(screen.getByTestId('activecollab-task-list-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('No tasks assigned')).not.toBeInTheDocument()
  })

  it('distinguishes a settled empty page from the loading skeleton', async () => {
    servePages(pageRows(1, [], false))
    await renderList()

    expect(screen.getByText('No tasks assigned')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing open is assigned to you in ActiveCollab right now.')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('activecollab-task-list-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders rows as a real list once a page lands', async () => {
    servePages(pageRows(1, [taskFixture()], false))
    await renderList()

    expect(screen.getByRole('list', { name: 'Muster UI' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByTestId('activecollab-task-list-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByText('No tasks assigned')).not.toBeInTheDocument()
  })

  it('replaces the rows with the described failure when nothing loaded', async () => {
    serveFailure('api')
    await renderList()

    expect(
      screen.getByText(
        'ActiveCollab returned an error that reconnecting will not fix: gateway down'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activecollab-task-list-skeleton')).not.toBeInTheDocument()
  })
})

describe('ActiveCollabTaskList failure recovery', () => {
  it('offers the connect path for an auth failure and opens the dialog', async () => {
    serveFailure('auth', 'invalid token')
    const { user } = await renderList()

    expect(
      screen.getByText(
        'ActiveCollab rejected those credentials. Enter your email and password again to reconnect.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByTestId('connect-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Connect ActiveCollab' }))
    expect(screen.getByTestId('connect-dialog')).toBeInTheDocument()
  })

  it('offers connect for a not-configured failure', async () => {
    serveFailure('not-configured', 'no token stored')
    await renderList()

    expect(screen.getByRole('button', { name: 'Connect ActiveCollab' })).toBeInTheDocument()
  })

  it('withholds the connect path from an api failure, leaving only a retry', async () => {
    serveFailure('api')
    await renderList()

    expect(screen.queryByRole('button', { name: 'Connect ActiveCollab' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('forces a fresh read when the retry is pressed', async () => {
    serveFailure('api')
    const { user } = await renderList()

    mocks.listAssignedTasks.mockClear()
    servePages(pageRows(1, [taskFixture()], false))
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(mocks.listAssignedTasks).toHaveBeenCalledWith(
      { page: 1 },
      expect.objectContaining({ force: true })
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('ActiveCollabTaskList row content', () => {
  it('names each row with its task, project, due day, and labels', async () => {
    servePages(
      pageRows(1, [taskFixture({ dueOn: FUTURE_DUE_ON, labels: [URGENT, UNCOLOURED] })], false)
    )
    await renderList()

    expect(
      screen.getByRole('button', {
        name: `Ship the codec in Muster UI, due ${FUTURE_DUE_LABEL}, labels URGENT, backlog`
      })
    ).toBeInTheDocument()
  })

  it('leaves the project to the group heading instead of printing it on the row', async () => {
    servePages(pageRows(1, [taskFixture()], false))
    await renderList()

    expect(rowButtons()[0]).not.toHaveTextContent('Muster UI')
    expect(screen.getByRole('heading', { level: 3 })).toHaveAccessibleName('Muster UI')
  })

  it('renders the local calendar day without re-projecting it through UTC', async () => {
    servePages(pageRows(1, [taskFixture({ dueOn: DUE_ON })], false))
    await renderList()

    const due = document.body.querySelector('time')
    // A UTC round trip would report 2026-03-13 for any positive offset.
    expect(due).toHaveAttribute('dateTime', '2026-03-14')
    expect(due).toHaveTextContent(DUE_LABEL)
  })

  it('flags a past due date as overdue in words, not only in colour', async () => {
    servePages(pageRows(1, [taskFixture({ dueOn: DUE_ON })], false))
    await renderList()

    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(rowButtons()[0]).toHaveAccessibleName(
      `Ship the codec in Muster UI, overdue ${DUE_LABEL}`
    )
  })

  it('leaves an upcoming due date unbadged', async () => {
    servePages(pageRows(1, [taskFixture({ dueOn: FUTURE_DUE_ON })], false))
    await renderList()

    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(document.body.querySelector('time')).toHaveTextContent(FUTURE_DUE_LABEL)
  })

  it('says so when a task has no due date', async () => {
    servePages(pageRows(1, [taskFixture()], false))
    await renderList()

    expect(screen.getByText('No due date')).toBeInTheDocument()
    expect(document.body.querySelector('time')).toBeNull()
  })

  it('fills each label with its colour and keeps the text legible on it', async () => {
    servePages(pageRows(1, [taskFixture({ labels: [URGENT, UNCOLOURED] })], false))
    await renderList()

    const [coloured, neutral] = screen.getAllByTestId('activecollab-task-label')
    expect(coloured).toHaveTextContent('URGENT')
    // #ff6600 AS TEXT was the legibility complaint; as a fill it takes black text.
    expect(coloured).toHaveStyle({ backgroundColor: '#ff6600', color: '#000000' })
    expect(neutral).toHaveTextContent('backlog')
    expect(neutral).not.toHaveAttribute('style')
    expect(neutral).toHaveClass('text-muted-foreground')
  })

  it('marks the selected row as current', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 501, name: 'First' }), taskFixture({ id: 502 })], false)
    )
    await renderList(502)

    // Undated rows sort newest-first, so 502 leads its group.
    const [top, bottom] = rowButtons()
    expect(top).toHaveAttribute('aria-current', 'true')
    expect(bottom).not.toHaveAttribute('aria-current')
  })
})

describe('ActiveCollabTaskList project grouping', () => {
  it('files each task under its own project', async () => {
    servePages(
      pageRows(
        1,
        [
          taskFixture({ id: 1, name: 'Zephyr task', projectId: 20, projectName: 'Zephyr' }),
          taskFixture({ id: 2, name: 'Alpha task', projectId: 10, projectName: 'Alpha' }),
          taskFixture({ id: 3, name: 'Alpha other', projectId: 10, projectName: 'Alpha' })
        ],
        false
      )
    )
    await renderList()

    const alpha = screen.getByRole('list', { name: 'Alpha' })
    const zephyr = screen.getByRole('list', { name: 'Zephyr' })
    expect(within(alpha).getAllByRole('listitem')).toHaveLength(2)
    expect(within(zephyr).getAllByRole('listitem')).toHaveLength(1)
    expect(within(zephyr).getByText('Zephyr task')).toBeInTheDocument()
  })

  it('ties each group heading to its own list for assistive tech', async () => {
    servePages(pageRows(1, [taskFixture({ projectId: 10, projectName: 'Alpha' })], false))
    await renderList()

    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading).toHaveAccessibleName('Alpha')
    expect(screen.getByRole('list', { name: 'Alpha' })).toHaveAttribute(
      'aria-labelledby',
      heading.id
    )
  })

  it('shows a per-group count without folding it into the heading name', async () => {
    servePages(
      pageRows(
        1,
        [
          taskFixture({ id: 1, projectId: 10, projectName: 'Alpha' }),
          taskFixture({ id: 2, projectId: 10, projectName: 'Alpha' }),
          taskFixture({ id: 3, projectId: 20, projectName: 'Zephyr' })
        ],
        false
      )
    )
    await renderList()

    const [alpha, zephyr] = screen.getAllByRole('heading', { level: 3 })
    expect(alpha).toHaveTextContent('2')
    expect(alpha).toHaveAccessibleName('Alpha')
    expect(zephyr).toHaveTextContent('1')
  })

  it('orders groups A to Z and rows by due date whatever order the page arrived in', async () => {
    servePages(
      pageRows(
        1,
        [
          taskFixture({
            id: 5,
            name: 'Zephyr later',
            projectId: 20,
            projectName: 'Zephyr',
            dueOn: FUTURE_DUE_ON
          }),
          taskFixture({ id: 6, name: 'Alpha undated', projectId: 10, projectName: 'Alpha' }),
          taskFixture({
            id: 7,
            name: 'Zephyr sooner',
            projectId: 20,
            projectName: 'Zephyr',
            dueOn: DUE_ON
          }),
          taskFixture({
            id: 8,
            name: 'Alpha dated',
            projectId: 10,
            projectName: 'Alpha',
            dueOn: DUE_ON
          })
        ],
        false
      )
    )
    await renderList()

    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings[0]).toHaveAccessibleName('Alpha')
    expect(headings[1]).toHaveAccessibleName('Zephyr')
    expect(rowButtons().map((row) => row.getAttribute('aria-label'))).toEqual([
      `Alpha dated in Alpha, overdue ${DUE_LABEL}`,
      'Alpha undated in Alpha',
      `Zephyr sooner in Zephyr, overdue ${DUE_LABEL}`,
      `Zephyr later in Zephyr, due ${FUTURE_DUE_LABEL}`
    ])
  })

  it('still renders sensibly when every task belongs to one project', async () => {
    servePages(pageRows(1, [taskFixture({ id: 1 }), taskFixture({ id: 2, name: 'Second' })], false))
    await renderList()

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('ActiveCollabTaskList activation', () => {
  it('reports the project and task ids on a mouse click', async () => {
    servePages(pageRows(1, [taskFixture({ id: 509323, projectId: 3790 })], false))
    const { onSelect, user } = await renderList()

    await user.click(rowButtons()[0])

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({ projectId: 3790, taskId: 509323 })
  })

  it('activates a focused row from the keyboard', async () => {
    servePages(
      pageRows(
        1,
        [
          taskFixture({ id: 509323, projectId: 3790 }),
          taskFixture({ id: 509324, projectId: 4001, name: 'Second task' })
        ],
        false
      )
    )
    const { onSelect, user } = await renderList()

    // Each group's collapse toggle is a real control, so it precedes its rows in the tab order.
    // The bind-site button would sit between them, but the binding UI is currently off — see
    // ACTIVECOLLAB_SITE_BINDING_UI_ENABLED; re-enabling it adds one tab stop per heading here.
    const [firstHeading, secondHeading] = screen.getAllByRole('button', { name: 'Muster UI' })

    // Entered at the first heading rather than tabbed into from the top: the header and filter bar
    // own every stop above it, and those are covered in task-page-activecollab-my-work.test.tsx.
    act(() => firstHeading.focus())
    await user.tab()
    await user.tab()
    expect(rowButtons()[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenNthCalledWith(1, { projectId: 3790, taskId: 509323 })

    await user.tab()
    expect(secondHeading).toHaveFocus()
    await user.tab()
    await user.tab()
    expect(rowButtons()[1]).toHaveFocus()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenNthCalledWith(2, { projectId: 4001, taskId: 509324 })
  })
})

describe('ActiveCollabTaskList paging', () => {
  it('never offers a next page when the server says there is none', async () => {
    servePages(pageRows(1, [taskFixture()], false))
    await renderList()

    expect(screen.queryByRole('button', { name: /Load more tasks/ })).not.toBeInTheDocument()
    expect(mocks.listAssignedTasks).toHaveBeenCalledTimes(1)
    expect(mocks.listAssignedTasks).toHaveBeenCalledWith({ page: 1 }, expect.anything())
  })

  it('requests page two and appends its rows when hasMore is set', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 1, name: 'First' })], true),
      pageRows(2, [taskFixture({ id: 2, name: 'Second' })], false)
    )
    const { user } = await renderList()

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    expect(mocks.listAssignedTasks).toHaveBeenNthCalledWith(2, { page: 2 }, expect.anything())
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Load more tasks/ })).not.toBeInTheDocument()
  })

  it('keeps the loaded rows on screen when the next page fails', async () => {
    servePages(pageRows(1, [taskFixture({ id: 1 })], true))
    const { user } = await renderList()

    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(
      screen.getByText(
        'ActiveCollab returned an error that reconnecting will not fix: no such page'
      )
    ).toBeInTheDocument()
  })

  // The load-bearing consequence of `listAssignedTasks` dropping completed tasks client-side: a
  // server page can arrive with every row already filtered out while `hasMore` is still set. If
  // paging were gated on the list being non-empty, the user would be stranded on "no tasks" with
  // their open work sitting on page two, unrequested.
  it('keeps paging reachable when a whole page arrives with every row filtered out', async () => {
    servePages(
      pageRows(1, [], true),
      pageRows(2, [taskFixture({ id: 3, name: 'Open task' })], false)
    )
    const { user } = await renderList()

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('No tasks assigned')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    expect(mocks.listAssignedTasks).toHaveBeenNthCalledWith(2, { page: 2 }, expect.anything())
    expect(screen.getByText('Open task')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Load more tasks/ })).not.toBeInTheDocument()
  })
})

describe('ActiveCollabTaskList runtime scope', () => {
  it('drops the previous environment rows and reloads when the runtime changes', async () => {
    servePages(pageRows(1, [taskFixture({ name: 'Local task' })], false))
    const { rerender } = await renderList()
    expect(screen.getByText('Local task')).toBeInTheDocument()

    mocks.settings = { activeRuntimeEnvironmentId: 'remote-1' }
    mocks.listAssignedTasks.mockReturnValue(new Promise<ListResult>(() => {}))
    await rerender()

    // The local scope's page is still cached, but it belongs to an instance this list left.
    expect(screen.queryByText('Local task')).not.toBeInTheDocument()
    expect(screen.getByTestId('activecollab-task-list-skeleton')).toBeInTheDocument()
    expect(mocks.listAssignedTasks).toHaveBeenCalledTimes(2)
  })

  it('ignores a read that resolves after the runtime moved on', async () => {
    let settleLocal: ((result: ListResult) => void) | null = null
    mocks.listAssignedTasks.mockReturnValueOnce(
      new Promise<ListResult>((resolve) => {
        settleLocal = resolve
      })
    )
    const { rerender } = await renderList()

    mocks.settings = { activeRuntimeEnvironmentId: 'remote-1' }
    servePages(pageRows(1, [taskFixture({ name: 'Remote task' })], false))
    await rerender()

    await act(async () => {
      settleLocal?.({ ok: false, kind: 'api', error: 'local instance died', status: 500 })
    })

    expect(screen.getByText('Remote task')).toBeInTheDocument()
    expect(screen.queryByText(/local instance died/)).not.toBeInTheDocument()
  })
})

describe('ActiveCollabTaskList group collapse', () => {
  const ALPHA = taskFixture({ id: 1, name: 'Alpha task', projectId: 10, projectName: 'Alpha' })
  const ZEPHYR = taskFixture({ id: 2, name: 'Zephyr task', projectId: 20, projectName: 'Zephyr' })

  it('folds a project away on click and brings it back on the next one', async () => {
    servePages(pageRows(1, [ALPHA, ZEPHYR], false))
    const { user } = await renderList()

    await user.click(groupToggle('Alpha'))

    expect(screen.queryByText('Alpha task')).not.toBeInTheDocument()
    // Only Alpha folded: collapse is per project, not a mode the whole list enters.
    expect(screen.getByText('Zephyr task')).toBeInTheDocument()

    await user.click(groupToggle('Alpha'))

    expect(screen.getByText('Alpha task')).toBeInTheDocument()
  })

  it('toggles from the keyboard on both Enter and Space', async () => {
    servePages(pageRows(1, [ALPHA], false))
    const { user } = await renderList()

    groupToggle('Alpha').focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByText('Alpha task')).not.toBeInTheDocument()

    await user.keyboard(' ')
    expect(screen.getByText('Alpha task')).toBeInTheDocument()
  })

  it('reports expansion state and the list it controls, keeping the list named', async () => {
    servePages(pageRows(1, [ALPHA], false))
    const { user } = await renderList()

    const toggle = groupToggle('Alpha')
    const list = screen.getByRole('list', { name: 'Alpha' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', list.id)
    // The heading still names the list; making it a control must not cost that association.
    expect(list).toHaveAttribute('aria-labelledby', screen.getByRole('heading', { level: 3 }).id)

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Hidden, not unmounted — `aria-controls` has to keep resolving to a real element.
    const collapsedList = document.getElementById(list.id)
    expect(collapsedList).toBeInTheDocument()
    expect(collapsedList).toHaveAttribute('aria-labelledby', toggle.closest('h3')?.id ?? '')
    expect(collapsedList).not.toBeVisible()
  })

  it('keeps the count visible while collapsed', async () => {
    servePages(
      pageRows(1, [ALPHA, taskFixture({ id: 3, projectId: 10, projectName: 'Alpha' })], false)
    )
    const { user } = await renderList()

    await user.click(groupToggle('Alpha'))

    // Knowing how much is folded away is the whole reason to fold rather than scroll.
    const heading = screen.getByRole('heading', { level: 3 })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(heading).toBeVisible()
    expect(heading).toHaveTextContent('2')
  })

  it('writes the toggle through the shared collapsed-groups set under a per-project key', async () => {
    servePages(pageRows(1, [ALPHA, ZEPHYR], false))
    const { user } = await renderList()

    await user.click(groupToggle('Zephyr'))

    expect(mocks.toggleCollapsedGroup).toHaveBeenCalledWith('activecollab-project:20')
    expect(mocks.persistedCollapsedGroups).toEqual([['activecollab-project:20']])
  })

  it('restores a collapsed project from the persisted set on first render', async () => {
    mocks.collapsedGroups = new Set([activeCollabGroupCollapseKey(10)])
    servePages(pageRows(1, [ALPHA, ZEPHYR], false))
    await renderList()

    expect(screen.queryByText('Alpha task')).not.toBeInTheDocument()
    expect(groupToggle('Alpha')).toHaveAttribute('aria-expanded', 'false')
    // A key belonging to another project must not fold this one.
    expect(screen.getByText('Zephyr task')).toBeInTheDocument()
    expect(groupToggle('Zephyr')).toHaveAttribute('aria-expanded', 'true')
  })

  it('ignores sidebar keys that happen to share the project id', async () => {
    mocks.collapsedGroups = new Set(['10', 'repo:10', 'pinned'])
    servePages(pageRows(1, [ALPHA], false))
    await renderList()

    expect(screen.getByText('Alpha task')).toBeInTheDocument()
  })

  it('opens a project seen for the first time even while a sibling stays collapsed', async () => {
    mocks.restoreCollapsedGroups([activeCollabGroupCollapseKey(10)])
    servePages(pageRows(1, [ALPHA], true), pageRows(2, [ZEPHYR], false))
    const { user } = await renderList()

    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    // Absence from the set is the default, so a project nobody has folded arrives open.
    expect(screen.getByText('Zephyr task')).toBeInTheDocument()
    expect(groupToggle('Zephyr')).toHaveAttribute('aria-expanded', 'true')
    expect(groupToggle('Alpha')).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays collapsed when the group gains and loses tasks', async () => {
    servePages(
      pageRows(1, [ALPHA], true),
      pageRows(
        2,
        [taskFixture({ id: 4, name: 'Alpha extra', projectId: 10, projectName: 'Alpha' })],
        false
      )
    )
    const { user } = await renderList()

    await user.click(groupToggle('Alpha'))
    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    // Collapse is keyed on the project, not on the row set, so a refetch cannot pop it open.
    expect(groupToggle('Alpha')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('2')
    expect(screen.queryByText('Alpha extra')).not.toBeInTheDocument()
  })

  it('leaves row height and ordering untouched across a collapse cycle', async () => {
    servePages(
      pageRows(
        1,
        [
          taskFixture({ id: 5, name: 'Alpha undated', projectId: 10, projectName: 'Alpha' }),
          taskFixture({
            id: 6,
            name: 'Alpha dated',
            projectId: 10,
            projectName: 'Alpha',
            dueOn: DUE_ON
          }),
          ZEPHYR
        ],
        false
      )
    )
    const { user } = await renderList()
    const before = rowButtons().map((row) => row.textContent)

    await user.click(groupToggle('Alpha'))
    await user.click(groupToggle('Alpha'))

    const after = rowButtons()
    expect(after.map((row) => row.textContent)).toEqual(before)
    expect(after[0]).toHaveTextContent('Alpha dated')
    for (const row of after) {
      expect(row.className).toContain('h-12')
    }
  })
})
