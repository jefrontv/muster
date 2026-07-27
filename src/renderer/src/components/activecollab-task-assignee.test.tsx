// @vitest-environment happy-dom
//
// The Assignee field end to end: what the trigger reads in each of the three states, when the
// 176-row roster is paid for, and the exact payload each choice writes.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskUpdate,
  ActiveCollabUser
} from '../../../shared/activecollab-types'

type DetailResult = ActiveCollabResult<ActiveCollabTaskDetail>
type TaskResult = ActiveCollabResult<ActiveCollabTask | null>
type UsersResult = ActiveCollabResult<ActiveCollabUser[]>
type UpdateArgs = ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate }

const mocks = vi.hoisted(() => ({
  fetchTaskDetail:
    vi.fn<(ref: ActiveCollabTaskRef, options?: { force?: boolean }) => Promise<DetailResult>>(),
  listUsers: vi.fn<() => Promise<UsersResult>>(),
  listProjectMembers: vi.fn<() => Promise<UsersResult>>(),
  listLabels: vi.fn(),
  updateTask: vi.fn<(args: UpdateArgs) => Promise<TaskResult>>(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  postComment: vi.fn(),
  getAttachmentImage: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeCollabStatus: {
        configured: true,
        reason: '',
        connection: {
          instanceUrl: 'https://projects.efront.com.au',
          userId: 407,
          userName: 'Jake',
          userEmail: 'jake@example.com'
        }
      },
      fetchActiveCollabTaskDetail: mocks.fetchTaskDetail,
      fetchActiveCollabAttachmentImage: mocks.getAttachmentImage,
      listActiveCollabLabels: mocks.listLabels,
      listActiveCollabUsers: mocks.listUsers,
      listActiveCollabProjectMembers: mocks.listProjectMembers,
      updateActiveCollabTask: mocks.updateTask,
      completeActiveCollabTask: mocks.completeTask,
      reopenActiveCollabTask: mocks.reopenTask,
      postActiveCollabComment: mocks.postComment
    })
}))

// Radix portals popover content out of the container and unmounts it while closed. This stand-in
// keeps the picker in the tree AND exposes the open transition, which is the only thing that may
// pay for the roster. Only the assignee field drives its popover CONTROLLED, so the label editor's
// uncontrolled one gets no open button and cannot be mistaken for it.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    onOpenChange
  }: {
    children?: React.ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (
    <div>
      {onOpenChange ? (
        <button type="button" data-testid="open-assignee" onClick={() => onOpenChange(true)} />
      ) : null}
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
}))

import { ActiveCollabTaskWorkspace } from './ActiveCollabTaskWorkspace'

const PROJECT_ID = 3790
const TASK_ID = 509323

const GRACE: ActiveCollabUser = { id: 7, name: 'Grace Hopper' }
const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace' }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing' }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese' }
const ROSTER = [JAKE, ADA, ALAN, GRACE]

const TASK: ActiveCollabTask = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  projectName: 'Efront Website',
  taskNumber: 42,
  name: 'Ship the ActiveCollab pane',
  bodyHtml: '<p>Body copy.</p>',
  isCompleted: false,
  dueOn: null,
  createdOn: null,
  updatedOn: null,
  assigneeId: GRACE.id,
  assigneeName: GRACE.name,
  labels: [],
  commentCount: 0,
  urlPath: '/projects/3790/tasks/509323',
  taskListId: null
}

const DETAIL: ActiveCollabTaskDetail = { task: TASK, comments: [], attachments: [] }

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  for (const mock of Object.values(mocks)) {
    ;(mock as Mock).mockReset()
  }
  mocks.fetchTaskDetail.mockResolvedValue({ ok: true, value: DETAIL })
  mocks.listUsers.mockResolvedValue({ ok: true, value: ROSTER })
  mocks.listProjectMembers.mockResolvedValue({ ok: true, value: ROSTER })
  mocks.listLabels.mockResolvedValue({ ok: true, value: [] })
  mocks.updateTask.mockResolvedValue({ ok: true, value: TASK })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

// A distinct `taskId` per mount is what makes a re-render refetch: the detail hook keys on the ref,
// so re-rendering the same id would keep the previous task on screen.
async function mount(patch?: Partial<ActiveCollabTask>, taskId: number = TASK_ID): Promise<void> {
  if (patch) {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, task: { ...TASK, id: taskId, ...patch } }
    })
  }
  await act(async () => {
    root.render(<ActiveCollabTaskWorkspace projectId={PROJECT_ID} taskId={taskId} />)
  })
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function trigger(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button[aria-label="Assignee"]')
  expect(found, 'no assignee trigger').toBeTruthy()
  return found as HTMLButtonElement
}

function triggerText(): string {
  const value = container.querySelector('[data-testid="activecollab-task-assignee"]')
  expect(value, 'no assignee value rendered').toBeTruthy()
  return value?.textContent?.trim() ?? ''
}

async function openPicker(): Promise<void> {
  const opener = container.querySelector<HTMLButtonElement>('[data-testid="open-assignee"]')
  expect(opener, 'no assignee popover opener').toBeTruthy()
  await click(opener as HTMLButtonElement)
}

function searchInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Search people..."]')
  expect(input, 'no roster search field').toBeTruthy()
  return input as HTMLInputElement
}

function optionNames(): string[] {
  return Array.from(container.querySelectorAll('[role="option"]')).map(
    (option) => option.textContent?.trim() ?? ''
  )
}

function optionFor(name: string): HTMLButtonElement {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[role="option"]')
  ).find((candidate) => candidate.textContent?.trim() === name)
  expect(found, `no roster row for "${name}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function unassignRow(): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Unassign'
    ) ?? null
  )
}

function alertText(): string | null {
  return container.querySelector('[role="alert"]')?.textContent ?? null
}

function typeInto(element: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ActiveCollab assignee roster loading', () => {
  it('does not read the roster until the picker is opened', async () => {
    await mount()

    expect(mocks.listUsers).not.toHaveBeenCalled()

    await openPicker()

    expect(mocks.listUsers).toHaveBeenCalledTimes(1)
  })

  it('reuses the roster it already has instead of re-reading on every open', async () => {
    await mount()

    await openPicker()
    await openPicker()

    expect(mocks.listUsers).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed roster read instead of claiming nobody matches', async () => {
    mocks.listUsers.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'Access denied',
      status: 403
    })
    await mount()

    await openPicker()

    expect(alertText()).toContain('Access denied')
    expect(optionNames()).toEqual([])
  })

  it('retries a failed roster read on the next open', async () => {
    mocks.listUsers.mockResolvedValueOnce({
      ok: false,
      kind: 'api',
      error: 'Access denied',
      status: 403
    })
    await mount()

    await openPicker()
    await openPicker()

    expect(mocks.listUsers).toHaveBeenCalledTimes(2)
    expect(optionNames()).toEqual(['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Jake Varrese'])
  })
})

describe('ActiveCollab assignee picker filtering', () => {
  it('filters the roster by name, case-insensitively', async () => {
    await mount()
    await openPicker()

    typeInto(searchInput(), 'ALAN')

    expect(optionNames()).toEqual(['Alan Turing'])
  })

  it('matches anywhere in the name, not just the start', async () => {
    await mount()
    await openPicker()

    typeInto(searchInput(), 'hopper')

    expect(optionNames()).toEqual(['Grace Hopper'])
  })

  it('says nobody matches rather than rendering an empty list', async () => {
    await mount()
    await openPicker()

    typeInto(searchInput(), 'nobody here')

    expect(optionNames()).toEqual([])
    expect(container.textContent).toContain('No people match.')
  })

  it('marks the current assignee as the selected option', async () => {
    await mount()
    await openPicker()

    expect(optionFor('Grace Hopper').getAttribute('aria-selected')).toBe('true')
    expect(optionFor('Alan Turing').getAttribute('aria-selected')).toBe('false')
  })
})

describe('ActiveCollab assignee writes', () => {
  it('writes the picked user id', async () => {
    mocks.updateTask.mockResolvedValue({
      ok: true,
      value: { ...TASK, assigneeId: ALAN.id, assigneeName: ALAN.name }
    })
    await mount()
    await openPicker()

    await click(optionFor('Alan Turing'))

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { assigneeId: ALAN.id }
    })
    expect(triggerText()).toBe('Alan Turing')
  })

  // An omitted key leaves the server's assignee alone, so Unassign would silently do nothing.
  it('unassigns with an explicit null rather than an omitted key', async () => {
    mocks.updateTask.mockResolvedValue({
      ok: true,
      value: { ...TASK, assigneeId: null, assigneeName: null }
    })
    await mount()
    await openPicker()

    await click(unassignRow() as HTMLButtonElement)

    const args = mocks.updateTask.mock.calls[0]?.[0]
    expect(args).toEqual({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { assigneeId: null }
    })
    expect('assigneeId' in (args?.update ?? {})).toBe(true)
    expect(args?.update.assigneeId).toBeNull()
    expect(triggerText()).toBe('Unassigned')
  })

  it('offers no unassign row when nobody is assigned, where it would write a no-op', async () => {
    await mount({ assigneeId: null, assigneeName: null })
    await openPicker()

    expect(unassignRow()).toBeNull()
  })

  it('refetches instead of erroring when the write lands but echoes no row', async () => {
    mocks.updateTask.mockResolvedValue({ ok: true, value: null })
    await mount()
    await openPicker()

    await click(optionFor('Alan Turing'))

    expect(mocks.fetchTaskDetail).toHaveBeenLastCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: true }
    )
    expect(alertText()).toBeNull()
    expect(container.textContent).toContain(TASK.name)
  })

  it('surfaces a failed assignee write without destroying the loaded task', async () => {
    mocks.updateTask.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'Task is locked',
      status: 500
    })
    await mount()
    await openPicker()

    await click(optionFor('Alan Turing'))

    expect(alertText()).toContain('Task is locked')
    expect(triggerText()).toBe('Grace Hopper')
  })

  it('disables the trigger and every picker row while a write is in flight', async () => {
    const pending = deferred<TaskResult>()
    mocks.updateTask.mockReturnValue(pending.promise)
    await mount()
    await openPicker()

    await click(optionFor('Alan Turing'))

    expect(trigger().disabled).toBe(true)
    expect(optionFor('Ada Lovelace').disabled).toBe(true)
    expect((unassignRow() as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      pending.resolve({
        ok: true,
        value: { ...TASK, assigneeId: ALAN.id, assigneeName: ALAN.name }
      })
    })

    expect(trigger().disabled).toBe(false)
    expect(optionFor('Ada Lovelace').disabled).toBe(false)
  })

  it('ignores a second pick while the first is still in flight', async () => {
    const pending = deferred<TaskResult>()
    mocks.updateTask.mockReturnValue(pending.promise)
    await mount()
    await openPicker()

    await click(optionFor('Alan Turing'))
    await click(optionFor('Ada Lovelace'))

    expect(mocks.updateTask).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve({ ok: true, value: TASK })
    })
  })
})

describe('ActiveCollab assignee trigger states', () => {
  it('renders the three states distinctly', async () => {
    await mount({ assigneeId: 7, assigneeName: 'Grace Hopper' }, 1)
    const named = triggerText()

    await mount({ assigneeId: null, assigneeName: null }, 2)
    const unassigned = triggerText()

    await mount({ assigneeId: 90210, assigneeName: null }, 3)
    const unresolved = triggerText()

    expect(named).toBe('Grace Hopper')
    expect(unassigned).toBe('Unassigned')
    expect(new Set([named, unassigned, unresolved]).size).toBe(3)
  })

  it('never reads an assigned-but-unnameable task as Unassigned, roster or no roster', async () => {
    await mount({ assigneeId: 90210, assigneeName: null })

    expect(triggerText()).not.toContain('Unassigned')
    expect(triggerText()).toContain('Assigned')

    // Still unnameable once the roster is in hand: 90210 is on no roster.
    await openPicker()

    expect(triggerText()).not.toContain('Unassigned')
    expect(triggerText()).toContain('Assigned')
  })

  // ActiveCollab 8 omits `assignee_name` from task rows, so most unresolved ids are nameable — the
  // roster just had not been paid for yet.
  it('names an unresolved assignee once the roster has been read', async () => {
    await mount({ assigneeId: JAKE.id, assigneeName: null })

    expect(triggerText()).toBe('Assigned (name unavailable)')

    await openPicker()

    expect(triggerText()).toBe(JAKE.name)
  })

  it('keeps the trigger operable in every state', async () => {
    await mount({ assigneeId: null, assigneeName: null })

    expect(trigger().disabled).toBe(false)
    expect(trigger().getAttribute('role')).toBe('combobox')
  })
})
