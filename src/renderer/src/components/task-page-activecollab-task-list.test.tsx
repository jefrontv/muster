// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { CacheEntry } from '@/store/slices/github'
import type { ActiveCollabTaskPageRows } from '@/store/slices/activecollab-task-patch'
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
  /** Re-renders with a different binding scope, as clearing or changing a binding does. */
  rerenderWith: (bindingStatus: ActiveCollabBindingStatus | undefined) => Promise<void>
}

const mocks = vi.hoisted(() => ({
  listAssignedTasks:
    vi.fn<
      (
        args?: { page?: number },
        options?: { force?: boolean }
      ) => Promise<ActiveCollabResult<ActiveCollabTaskPageRows>>
    >(),
  cache: {} as Record<string, CacheEntry<ActiveCollabTaskPageRows>>,
  settings: { activeRuntimeEnvironmentId: null as string | null }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      listActiveCollabAssignedTasks: mocks.listAssignedTasks,
      activeCollabTaskPageCache: mocks.cache,
      settings: mocks.settings
    })
}))

// The real dialog portals through Radix; a stand-in keeps the assertion on whether the list opened
// the connect path at all.
vi.mock('@/components/activecollab-connect-dialog', () => ({
  ActiveCollabConnectDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="connect-dialog" /> : null
}))

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { ActiveCollabTaskList } from './task-page-activecollab-task-list'
import type { ActiveCollabBindingStatus } from './activecollab-project-binding-state'

const BOUND: ActiveCollabBindingStatus = {
  kind: 'bound',
  binding: { projectId: 3790, projectName: 'Muster UI', boundAt: 1700 },
  upstreamName: 'Muster UI'
}

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
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 42,
    assigneeName: 'Ada Lovelace',
    labels: [],
    commentCount: 0,
    urlPath: '/projects/3790/tasks/501',
    taskListId: null,
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

async function renderList(
  selectedTaskId: number | null = null,
  bindingStatus?: ActiveCollabBindingStatus
): Promise<RenderedList> {
  const onSelect = vi.fn<(ref: ActiveCollabTaskRef) => void>()
  const user = userEvent.setup()
  // A fresh element each time: React bails out of re-rendering an identical element reference,
  // which would silently hide the scope change under test.
  const elementFor = (scope: ActiveCollabBindingStatus | undefined): React.JSX.Element => (
    <ActiveCollabTaskList
      bindingStatus={scope}
      onSelect={onSelect}
      selectedTaskId={selectedTaskId}
    />
  )
  const view = await act(async () => render(elementFor(bindingStatus)))
  const rerenderWith = async (scope: ActiveCollabBindingStatus | undefined): Promise<void> => {
    await act(async () => {
      view.rerender(elementFor(scope))
    })
  }
  return {
    onSelect,
    user,
    rerender: () => rerenderWith(bindingStatus),
    rerenderWith
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

beforeEach(() => {
  mocks.listAssignedTasks.mockReset()
  mocks.cache = {}
  mocks.settings = { activeRuntimeEnvironmentId: null }
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

    await user.tab()
    expect(rowButtons()[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenNthCalledWith(1, { projectId: 3790, taskId: 509323 })

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

describe('ActiveCollabTaskList project binding scope', () => {
  const OTHER_PROJECT = { projectId: 4100, projectName: 'Zebra Migration' }

  it('shows every project when nothing is bound', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 1 }), taskFixture({ id: 2, ...OTHER_PROJECT })], false)
    )
    await renderList()

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'Zebra Migration' })).toBeVisible()
  })

  it('keeps only the bound project rows', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 1 }), taskFixture({ id: 2, ...OTHER_PROJECT })], false)
    )
    await renderList(null, BOUND)

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('list', { name: 'Muster UI' })).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Zebra Migration' })).not.toBeInTheDocument()
  })

  it('names the bound project in the empty state instead of claiming nothing is assigned', async () => {
    servePages(pageRows(1, [taskFixture({ id: 2, ...OTHER_PROJECT })], false))
    await renderList(null, BOUND)

    expect(screen.getByText('No tasks in Muster UI')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing open is assigned to you in Muster UI right now.')
    ).toBeInTheDocument()
    expect(screen.queryByText('No tasks assigned')).not.toBeInTheDocument()
  })

  // The load-bearing consequence of filtering client-side over a server-paged list: a full page
  // can be entirely other projects' tasks, so `empty` no longer means "exhausted". If paging were
  // gated on the list being non-empty, the user would be stranded on "no tasks" with their own
  // rows sitting on page two, unrequested.
  it('keeps paging reachable when a whole page filters down to nothing', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 2, ...OTHER_PROJECT })], true),
      pageRows(2, [taskFixture({ id: 3, name: 'Scoped task' })], false)
    )
    const { user } = await renderList(null, BOUND)

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(
      screen.getByText(
        'None of the tasks loaded so far belong to Muster UI. Load more to keep looking.'
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Load more tasks/ }))

    expect(mocks.listAssignedTasks).toHaveBeenNthCalledWith(2, { page: 2 }, expect.anything())
    expect(screen.getByText('Scoped task')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  // A binding whose project vanished upstream: rows must not silently widen back to the whole
  // account. The bar above the list carries the explanation.
  it('renders nothing for a binding whose project no longer exists', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 1 }), taskFixture({ id: 2, ...OTHER_PROJECT })], false)
    )
    await renderList(null, {
      kind: 'missing',
      binding: { projectId: 999_999, projectName: 'Deleted Project', boundAt: 1700 }
    })

    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('No tasks in Deleted Project')).toBeInTheDocument()
  })

  it('widens back to every task when the binding is cleared', async () => {
    servePages(
      pageRows(1, [taskFixture({ id: 1 }), taskFixture({ id: 2, ...OTHER_PROJECT })], false)
    )
    const { rerenderWith } = await renderList(null, BOUND)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    await rerenderWith({ kind: 'unbound' })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'Zebra Migration' })).toBeVisible()
  })
})
