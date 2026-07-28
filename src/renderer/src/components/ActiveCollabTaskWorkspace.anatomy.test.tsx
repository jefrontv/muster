// @vitest-environment happy-dom
//
// The pane's SHAPE: what the skeleton stands in for, and what the loaded surface names. Write
// behaviour (label merging, due-date clearing, settlement rules) lives in
// `ActiveCollabTaskWorkspace.test.tsx`.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabComment,
  ActiveCollabLabel,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabUser
} from '../../../shared/activecollab-types'

type DetailResult = ActiveCollabResult<ActiveCollabTaskDetail>
type TaskResult = ActiveCollabResult<ActiveCollabTask | null>

const mocks = vi.hoisted(() => ({
  fetchTaskDetail:
    vi.fn<(ref: ActiveCollabTaskRef, options?: { force?: boolean }) => Promise<DetailResult>>(),
  getAttachmentImage: vi.fn(),
  listLabels: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabLabel[]>>>(),
  updateTask: vi.fn(),
  completeTask: vi.fn<(args: { taskId: number }) => Promise<TaskResult>>(),
  reopenTask: vi.fn(),
  postComment: vi.fn(),
  listUsers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>(),
  listProjectMembers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeCollabStatus: {
        configured: true,
        reason: '',
        connection: {
          instanceUrl: 'https://projects.efront.com.au',
          userId: 7,
          userName: 'Jake',
          userEmail: 'jake@example.com'
        }
      },
      fetchActiveCollabTaskDetail: mocks.fetchTaskDetail,
      fetchActiveCollabAttachmentImage: mocks.getAttachmentImage,
      listActiveCollabLabels: mocks.listLabels,
      updateActiveCollabTask: mocks.updateTask,
      completeActiveCollabTask: mocks.completeTask,
      reopenActiveCollabTask: mocks.reopenTask,
      postActiveCollabComment: mocks.postComment,
      listActiveCollabUsers: mocks.listUsers,
      listActiveCollabProjectMembers: mocks.listProjectMembers
    })
}))

import { ActiveCollabTaskWorkspace } from './ActiveCollabTaskWorkspace'

const PROJECT_ID = 3790
const TASK_ID = 509323
const CREATED_ON = new Date(2026, 5, 14, 9, 30).getTime()
const CREATED_LABEL = new Date(CREATED_ON).toLocaleString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

const LABELS: ActiveCollabLabel[] = [{ id: 1, name: 'ON LOCAL', color: '#ff0000' }]

const TASK: ActiveCollabTask = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  projectName: '30494 - Orleton OM',
  taskNumber: 42,
  name: 'Ship the ActiveCollab pane',
  bodyHtml: '<p>Body copy.</p>',
  isCompleted: false,
  dueOn: new Date(2026, 6, 27).getTime(),
  createdOn: CREATED_ON,
  updatedOn: CREATED_ON,
  assigneeId: 7,
  assigneeName: 'Jake Varrese',
  labels: LABELS,
  commentCount: 1,
  urlPath: '/projects/3790/tasks/509323',
  taskListId: null
}

const COMMENT: ActiveCollabComment = {
  id: 9,
  bodyHtml: '<p>Reviewed and ready.</p>',
  bodyPlainText: 'Reviewed and ready.',
  createdOn: Date.UTC(2026, 6, 20, 3, 0),
  createdById: 7,
  createdByName: 'Ada Lovelace',
  attachments: []
}

const DETAIL: ActiveCollabTaskDetail = { task: TASK, comments: [COMMENT], attachments: [] }

function detailFor(patch: Partial<ActiveCollabTask>): DetailResult {
  return { ok: true, value: { ...DETAIL, task: { ...TASK, ...patch } } }
}

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
  // The composer subscribes to the preload drop router the moment it mounts.
  window.api = { ui: { onFileDrop: () => () => {} } } as never
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.fetchTaskDetail.mockResolvedValue({ ok: true, value: DETAIL })
  mocks.listLabels.mockResolvedValue({ ok: true, value: LABELS })
  mocks.listUsers.mockResolvedValue({ ok: true, value: [] })
  mocks.listProjectMembers.mockResolvedValue({ ok: true, value: [] })
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

async function mount(taskId: number = TASK_ID): Promise<void> {
  await act(async () => {
    root.render(<ActiveCollabTaskWorkspace projectId={PROJECT_ID} taskId={taskId} />)
  })
}

function skeleton(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="activecollab-task-skeleton"]')
}

function buttonWith(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )
  expect(found, `no button containing "${text}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function buttonByLabel(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(found, `no button labelled "${label}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function headingTexts(): string[] {
  return Array.from(container.querySelectorAll('h3')).map((heading) => heading.textContent ?? '')
}

function assigneeText(): string {
  const value = container.querySelector('[data-testid="activecollab-task-assignee"]')
  expect(value, 'no assignee value rendered').toBeTruthy()
  return value?.textContent?.trim() ?? ''
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('ActiveCollabTaskWorkspace skeleton loading', () => {
  it('stands in for the pane with a shimmer rather than a spinner on a first load', async () => {
    const pending = deferred<DetailResult>()
    mocks.fetchTaskDetail.mockReturnValue(pending.promise)

    await mount()

    const bones = skeleton()?.querySelectorAll('.animate-pulse') ?? []
    expect(bones.length).toBeGreaterThan(8)
    expect(container.querySelector('.animate-spin')).toBeNull()
    // The band structure the real pane uses, so landing content replaces bones in place.
    expect(skeleton()?.querySelector('.grid')).toBeTruthy()
    expect(skeleton()?.textContent).toContain('Loading task')

    await act(async () => {
      pending.resolve({ ok: true, value: DETAIL })
    })

    expect(skeleton()).toBeNull()
    expect(container.textContent).toContain(TASK.name)
  })

  it('disables the shimmer under prefers-reduced-motion, on every bone', async () => {
    mocks.fetchTaskDetail.mockReturnValue(deferred<DetailResult>().promise)

    await mount()

    const bones = Array.from(skeleton()?.querySelectorAll('.animate-pulse') ?? [])
    expect(bones.length).toBeGreaterThan(0)
    for (const bone of bones) {
      expect(bone.className).toContain('motion-reduce:animate-none')
    }
  })

  it('skeletons a genuine first load but never a task it has already shown', async () => {
    const otherId = 509400
    await mount()
    expect(skeleton()).toBeNull()

    // A task this pane has never rendered IS a first load.
    const first = deferred<DetailResult>()
    mocks.fetchTaskDetail.mockReturnValue(first.promise)
    await mount(otherId)
    expect(skeleton()).toBeTruthy()
    await act(async () => {
      first.resolve(detailFor({ id: otherId, taskNumber: 43, name: 'Second task' }))
    })
    expect(container.textContent).toContain('Second task')

    // Switching back must not blank content the user was reading, even while its refresh is out.
    mocks.fetchTaskDetail.mockReturnValue(deferred<DetailResult>().promise)
    await mount()
    expect(skeleton()).toBeNull()
    expect(container.textContent).toContain(TASK.name)
  })

  it('keeps the task on screen while a background refetch is in flight', async () => {
    mocks.completeTask.mockResolvedValue({ ok: true, value: null })
    await mount()
    mocks.fetchTaskDetail.mockReturnValue(deferred<DetailResult>().promise)

    // `ok: true` with a null value forces a refetch over a task already on screen.
    await click(buttonByLabel('Complete task'))

    expect(mocks.fetchTaskDetail).toHaveBeenLastCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: true }
    )
    expect(skeleton()).toBeNull()
    expect(container.textContent).toContain(TASK.name)
    expect(container.textContent).toContain('Jake Varrese')
  })
})

describe('ActiveCollabTaskWorkspace anatomy', () => {
  it('names the project, task number and creation date beneath the title', async () => {
    await mount()

    const identity = container.querySelector('header p')?.textContent ?? ''
    expect(identity).toContain('30494 - Orleton OM')
    expect(identity).toContain('Task #42')
    expect(identity).toContain(`Created ${CREATED_LABEL}`)
    expect(container.querySelector('header h2')?.textContent).toBe(TASK.name)
  })

  it('pairs completion with the title as a toggle that reports its own state', async () => {
    await mount()

    const toggle = buttonByLabel('Complete task')
    expect(container.querySelector('header')?.contains(toggle)).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    mocks.fetchTaskDetail.mockResolvedValue(detailFor({ id: 509401, isCompleted: true }))
    await mount(509401)

    expect(buttonByLabel('Reopen task').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('header h2')?.className).toContain('line-through')
  })

  it('groups assignee, due date and labels as named fields', async () => {
    await mount()

    const terms = Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent)
    expect(terms).toEqual(['Assignee', 'Due date', 'Labels'])
    expect(assigneeText()).toBe('Jake Varrese')
    // Already anchored to the local calendar day upstream — shown as-is, under its own label.
    expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe(
      '2026-07-27'
    )
    expect(buttonWith('Edit labels')).toBeTruthy()
  })

  it('titles the description and discussion bands', async () => {
    await mount()

    const headings = headingTexts()
    expect(headings.some((text) => text.includes('Description'))).toBe(true)
    expect(headings.some((text) => text.includes('Discussion'))).toBe(true)
  })

  it('attributes every comment to its author under the Discussion heading', async () => {
    await mount()

    const discussion = headingTexts().find((text) => text.startsWith('Discussion'))
    // The heading carries the count, so the thread's size reads without scrolling it.
    expect(discussion).toContain('1')

    const attribution = container.querySelector('article div')?.textContent ?? ''
    expect(attribution).toContain('Ada Lovelace')
    // Initials stand in for the avatar the provider never ships.
    expect(attribution).toContain('AL')
    expect(container.querySelector('article')?.textContent).toContain('Reviewed and ready.')
  })

  it('offers a calm Set affordance instead of an empty date box, and opens on demand', async () => {
    mocks.fetchTaskDetail.mockResolvedValue(detailFor({ id: 509402, dueOn: null }))
    await mount(509402)

    expect(container.querySelector('input[type="date"]')).toBeNull()

    await click(buttonWith('Set...'))

    expect(container.querySelector('input[type="date"]')).toBeTruthy()
    expect(mocks.updateTask).not.toHaveBeenCalled()
  })

  it('labels the add action when a task carries no labels yet', async () => {
    mocks.fetchTaskDetail.mockResolvedValue(detailFor({ id: 509403, labels: [] }))
    await mount(509403)

    expect(buttonWith('Add labels')).toBeTruthy()
  })
})

describe('ActiveCollabTaskWorkspace assignee', () => {
  async function assigneeFor(taskId: number, patch: Partial<ActiveCollabTask>): Promise<string> {
    mocks.fetchTaskDetail.mockResolvedValue(detailFor({ id: taskId, ...patch }))
    await mount(taskId)
    return assigneeText()
  }

  it('renders the three assignee states distinctly', async () => {
    const named = await assigneeFor(1, { assigneeId: 7, assigneeName: 'Jake Varrese' })
    const unassigned = await assigneeFor(2, { assigneeId: null, assigneeName: null })
    const unresolved = await assigneeFor(3, { assigneeId: 407, assigneeName: null })

    expect(named).toBe('Jake Varrese')
    expect(unassigned).toBe('Unassigned')
    expect(new Set([named, unassigned, unresolved]).size).toBe(3)
  })

  it('never reports an assigned-but-unnameable task as Unassigned', async () => {
    const unresolved = await assigneeFor(4, { assigneeId: 407, assigneeName: null })

    expect(unresolved).not.toContain('Unassigned')
    expect(unresolved).toContain('Assigned')
  })
})
