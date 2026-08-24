// @vitest-environment happy-dom
//
// The editing half of the task pane: subtasks, the click-to-edit title and description, priority,
// watchers, and the own-comment actions. Load states, labels and due dates live in
// `ActiveCollabTaskWorkspace.test.tsx`; this file asserts the exact payload each new control writes
// and, for the comment actions, WHOSE comments they appear on at all.

import { act, useEffect, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TiptapReact from '@tiptap/react'
import type { Editor } from '@tiptap/react'

import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskUpdate,
  ActiveCollabUser
} from '../../../shared/activecollab-types'

type DetailResult = ActiveCollabResult<ActiveCollabTaskDetail>
type TaskResult = ActiveCollabResult<ActiveCollabTask | null>
type CommentResult = ActiveCollabResult<ActiveCollabComment | null>
type SubtaskResult = ActiveCollabResult<ActiveCollabSubtask | null>
type UpdateArgs = ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate }

const mocks = vi.hoisted(() => ({
  fetchTaskDetail:
    vi.fn<(ref: ActiveCollabTaskRef, options?: { force?: boolean }) => Promise<DetailResult>>(),
  getAttachmentImage: vi.fn(),
  listLabels: vi.fn(),
  listUsers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>(),
  listProjectMembers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>(),
  updateTask: vi.fn<(args: UpdateArgs) => Promise<TaskResult>>(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  postComment: vi.fn(),
  createSubtask:
    vi.fn<
      (
        args: ActiveCollabTaskRef & { name: string; assigneeId?: number | null }
      ) => Promise<SubtaskResult>
    >(),
  updateSubtask:
    vi.fn<
      (
        args: ActiveCollabTaskRef & { subtaskId: number; update: ActiveCollabSubtaskUpdate }
      ) => Promise<SubtaskResult>
    >(),
  setSubtaskCompletion:
    vi.fn<
      (args: { taskId: number; subtaskId: number; isCompleted: boolean }) => Promise<SubtaskResult>
    >(),
  updateComment:
    vi.fn<
      (args: { taskId: number; commentId: number; bodyHtml: string }) => Promise<CommentResult>
    >(),
  deleteComment:
    vi.fn<(args: { taskId: number; commentId: number }) => Promise<ActiveCollabResult<null>>>(),
  setSubscription:
    vi.fn<
      (args: {
        taskId: number
        userId: number
        subscribed: boolean
      }) => Promise<ActiveCollabResult<null>>
    >(),
  markTaskRead: vi.fn(async () => {})
}))

// Separate from `mocks`, whose every value is reset in beforeEach: happy-dom has no
// contenteditable, so the only way to put words in a body editor is through its instance. Keyed by
// the editor's accessible name, because several are mounted at once — the composer always, plus
// whichever seeded editor was just opened.
const editors = vi.hoisted(() => ({ byLabel: new Map<string, Editor>() }))

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof TiptapReact>()
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const instance = actual.useEditor(...args)
      // `attributes` is either a record or a state-reading function; only the record form carries
      // the name these editors are set up with.
      const attributes = args[0]?.editorProps?.attributes
      const label = typeof attributes === 'object' ? attributes['aria-label'] : undefined
      if (instance !== null && typeof label === 'string') {
        editors.byLabel.set(label, instance)
      }
      return instance
    }
  }
})

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
      listActiveCollabUsers: mocks.listUsers,
      listActiveCollabProjectMembers: mocks.listProjectMembers,
      updateActiveCollabTask: mocks.updateTask,
      completeActiveCollabTask: mocks.completeTask,
      reopenActiveCollabTask: mocks.reopenTask,
      postActiveCollabComment: mocks.postComment,
      createActiveCollabSubtask: mocks.createSubtask,
      updateActiveCollabSubtask: mocks.updateSubtask,
      setActiveCollabSubtaskCompletion: mocks.setSubtaskCompletion,
      updateActiveCollabComment: mocks.updateComment,
      deleteActiveCollabComment: mocks.deleteComment,
      setActiveCollabTaskSubscription: mocks.setSubscription,
      markActiveCollabTaskRead: mocks.markTaskRead,
      chatWorkspaces: []
    })
}))

// Radix portals popover content out of the container and unmounts it while closed. This stand-in
// keeps every popover's content in the tree AND reports the open transition, which is what pays for
// the people list the watchers row joins against.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    onOpenChange
  }: {
    children?: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => {
    // Once per mounted popover, guarded by a ref rather than the callback's identity: the real
    // fields pass a fresh handler each render, so an identity-keyed effect would never settle.
    const opened = useRef(false)
    useEffect(() => {
      if (opened.current) {
        return
      }
      opened.current = true
      onOpenChange?.(true)
    }, [onOpenChange])
    return <div>{children}</div>
  },
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

// Same reason as the popover: the delete confirmation is a portalled Radix dialog, and its whole
// point is that the write waits for it, so it has to be assertable inside the container.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open === true ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

import { ActiveCollabTaskWorkspace } from './ActiveCollabTaskWorkspace'

const PROJECT_ID = 3790
const TASK_ID = 509323
const VIEWER_ID = 7

const JAKE: ActiveCollabUser = { id: VIEWER_ID, name: 'Jake Varrese', avatarUrl: null }
const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace', avatarUrl: null }
const ROSTER = [JAKE, ADA]

const TASK: ActiveCollabTask = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  projectName: 'Efront Website',
  taskNumber: 42,
  name: 'Ship the ActiveCollab pane',
  bodyHtml: '<p>Body copy.</p>',
  isCompleted: false,
  startOn: null,
  dueOn: null,
  createdOn: null,
  updatedOn: null,
  assigneeId: null,
  assigneeName: null,
  createdById: null,
  createdByName: null,
  labels: [],
  commentCount: 2,
  urlPath: '/projects/3790/tasks/509323',
  taskListId: null,
  isHiddenFromClients: false,
  isImportant: false,
  estimate: null,
  jobTypeId: null,
  openSubtaskCount: null,
  totalSubtaskCount: null
}

const OPEN_SUBTASK: ActiveCollabSubtask = {
  id: 71,
  taskId: TASK_ID,
  name: 'Wire the toggle',
  isCompleted: false,
  assigneeId: null,
  assigneeName: null,
  dueOn: null,
  createdOn: null
}

const DONE_SUBTASK: ActiveCollabSubtask = {
  ...OPEN_SUBTASK,
  id: 72,
  name: 'Read the API',
  isCompleted: true
}

const MY_COMMENT: ActiveCollabComment = {
  id: 9,
  bodyHtml: '<p>Mine to edit.</p>',
  bodyPlainText: 'Mine to edit.',
  createdOn: Date.UTC(2026, 6, 20, 3, 0),
  createdById: VIEWER_ID,
  createdByName: 'Jake Varrese',
  attachments: []
}

const THEIR_COMMENT: ActiveCollabComment = {
  ...MY_COMMENT,
  id: 10,
  bodyHtml: '<p>Theirs to keep.</p>',
  bodyPlainText: 'Theirs to keep.',
  createdById: ADA.id,
  createdByName: 'Ada Lovelace'
}

const DETAIL: ActiveCollabTaskDetail = {
  task: TASK,
  comments: [MY_COMMENT, THEIR_COMMENT],
  attachments: [],
  subtasks: [OPEN_SUBTASK, DONE_SUBTASK],
  // Ada watches, the signed-in user does not: both toggle directions are reachable.
  subscriberIds: [ADA.id],
  trackedTime: null
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
  editors.byLabel.clear()
  mocks.fetchTaskDetail.mockResolvedValue({ ok: true, value: DETAIL })
  mocks.listLabels.mockResolvedValue({ ok: true, value: [] })
  mocks.listUsers.mockResolvedValue({ ok: true, value: ROSTER })
  mocks.listProjectMembers.mockResolvedValue({ ok: true, value: ROSTER })
  mocks.updateTask.mockResolvedValue({ ok: true, value: TASK })
  mocks.createSubtask.mockResolvedValue({ ok: true, value: null })
  mocks.updateSubtask.mockResolvedValue({ ok: true, value: null })
  mocks.setSubtaskCompletion.mockResolvedValue({ ok: true, value: null })
  mocks.updateComment.mockResolvedValue({ ok: true, value: null })
  mocks.deleteComment.mockResolvedValue({ ok: true, value: null })
  mocks.setSubscription.mockResolvedValue({ ok: true, value: null })
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

async function mount(detail: ActiveCollabTaskDetail = DETAIL): Promise<void> {
  mocks.fetchTaskDetail.mockResolvedValue({ ok: true, value: detail })
  await act(async () => {
    root.render(<ActiveCollabTaskWorkspace projectId={PROJECT_ID} taskId={TASK_ID} />)
  })
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function buttonByLabel(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(found, `no button labelled "${label}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function buttonWith(text: string, root: ParentNode = container): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === text
  )
  expect(found, `no button reading "${text}"`).toBeTruthy()
  return found as HTMLButtonElement
}

/**
 * The frame around ONE body editor, found through the editor's accessible name. Scoping matters:
 * the popover stand-in keeps every popover's content mounted, so several Save buttons exist at
 * once — the due-date picker's among them.
 */
function bodyEditorFrame(label: string): HTMLElement {
  const dom = container.querySelector(`[aria-label="${label}"]`)
  const frame = dom?.closest('[data-slot="activecollab-rich-body"]')
  expect(frame, `no body editor labelled "${label}"`).toBeTruthy()
  return frame as HTMLElement
}

function inputByLabel(label: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  expect(found, `no field labelled "${label}"`).toBeTruthy()
  return found as HTMLInputElement
}

/** Article by the body text it carries, so a comment's own actions can be scoped to its card. */
function commentCard(text: string): HTMLElement {
  const found = Array.from(container.querySelectorAll('article')).find((candidate) =>
    candidate.textContent?.includes(text)
  )
  expect(found, `no comment card containing "${text}"`).toBeTruthy()
  return found as HTMLElement
}

function typeInto(element: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function pressKey(element: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/** Writes a body into the editor with this accessible name. */
function typeBody(label: string, paragraphs: string[]): void {
  const editor = editors.byLabel.get(label)
  if (editor === undefined) {
    throw new Error(`no editor labelled "${label}"`)
  }
  act(() => {
    editor.commands.setContent({
      type: 'doc',
      content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
    })
  })
}

describe('ActiveCollab task pane subtasks', () => {
  it('adds a subtask from the inline row and clears the draft', async () => {
    await mount()

    const field = inputByLabel('Add a subtask')
    typeInto(field, '  Wire the pane  ')
    await pressKey(field, 'Enter')

    expect(mocks.createSubtask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      name: 'Wire the pane'
    })
    expect(inputByLabel('Add a subtask').value).toBe('')
  })

  it('writes nothing when the add row is empty or only spaces', async () => {
    await mount()

    const field = inputByLabel('Add a subtask')
    await pressKey(field, 'Enter')
    typeInto(field, '   ')
    await pressKey(field, 'Enter')

    expect(mocks.createSubtask).not.toHaveBeenCalled()
  })

  it('toggles a subtask complete and shows the echoed row as done', async () => {
    mocks.setSubtaskCompletion.mockResolvedValue({
      ok: true,
      value: { ...OPEN_SUBTASK, isCompleted: true }
    })
    await mount()

    await click(buttonByLabel(OPEN_SUBTASK.name))

    expect(mocks.setSubtaskCompletion).toHaveBeenCalledWith({
      taskId: TASK_ID,
      subtaskId: OPEN_SUBTASK.id,
      isCompleted: true
    })
    expect(buttonWith(OPEN_SUBTASK.name).className).toContain('line-through')
  })

  it('sorts completed subtasks after open ones and counts them in the heading', async () => {
    await mount()

    const names = Array.from(container.querySelectorAll('li button[type="button"]'))
      .map((button) => button.textContent?.trim())
      .filter((text) => text === OPEN_SUBTASK.name || text === DONE_SUBTASK.name)
    expect(names).toEqual([OPEN_SUBTASK.name, DONE_SUBTASK.name])

    const heading = Array.from(container.querySelectorAll('h3')).find((node) =>
      node.textContent?.includes('Subtasks')
    )
    expect(heading?.textContent).toContain('1/2')
  })

  it('renames a subtask on Enter and ignores unchanged text', async () => {
    await mount()

    await click(buttonWith(OPEN_SUBTASK.name))
    const field = inputByLabel('Rename subtask')
    await pressKey(field, 'Enter')
    expect(mocks.updateSubtask).not.toHaveBeenCalled()

    await click(buttonWith(OPEN_SUBTASK.name))
    const reopened = inputByLabel('Rename subtask')
    typeInto(reopened, 'Wire the toggle properly')
    await pressKey(reopened, 'Enter')

    expect(mocks.updateSubtask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      subtaskId: OPEN_SUBTASK.id,
      update: { name: 'Wire the toggle properly' }
    })
  })

  it('keeps the add row and drops the heading when there are no subtasks', async () => {
    await mount({ ...DETAIL, subtasks: [] })

    expect(inputByLabel('Add a subtask')).toBeTruthy()
    const headings = Array.from(container.querySelectorAll('h3')).map((node) => node.textContent)
    expect(headings.some((text) => text?.includes('Subtasks'))).toBe(false)
  })
})

describe('ActiveCollab task pane title', () => {
  it('commits a changed title on Enter', async () => {
    await mount()

    await click(container.querySelector('header h2 button') as HTMLButtonElement)
    const field = inputByLabel('Rename task')
    typeInto(field, 'Ship the pane properly')
    await pressKey(field, 'Enter')

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { name: 'Ship the pane properly' }
    })
  })

  it('writes nothing when the title is unchanged, and nothing on Escape', async () => {
    await mount()

    await click(container.querySelector('header h2 button') as HTMLButtonElement)
    await pressKey(inputByLabel('Rename task'), 'Enter')
    expect(mocks.updateTask).not.toHaveBeenCalled()

    await click(container.querySelector('header h2 button') as HTMLButtonElement)
    const field = inputByLabel('Rename task')
    typeInto(field, 'Abandoned edit')
    await pressKey(field, 'Escape')

    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(container.querySelector('header h2')?.textContent).toContain(TASK.name)
  })
})

describe('ActiveCollab task pane description', () => {
  it('saves the edited body as ActiveCollab HTML', async () => {
    await mount()

    await click(buttonByLabel('Edit description'))
    typeBody('Edit description', ['Rewritten body'])
    await click(buttonWith('Save', bodyEditorFrame('Edit description')))

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { bodyHtml: '<p>Rewritten body</p>' }
    })
  })

  it('writes nothing when the edit is cancelled', async () => {
    await mount()

    await click(buttonByLabel('Edit description'))
    typeBody('Edit description', ['Discarded'])
    await click(buttonWith('Cancel', bodyEditorFrame('Edit description')))

    expect(mocks.updateTask).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Body copy.')
  })
})

describe('ActiveCollab task pane priority', () => {
  it('flags the task important from the priority row', async () => {
    await mount()

    await click(buttonWith('Normal'))

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { isImportant: true }
    })
  })

  it('shows tracked time over the estimate', async () => {
    await mount({ ...DETAIL, task: { ...TASK, estimate: 8 }, trackedTime: 2.5 })

    const terms = Array.from(container.querySelectorAll('dt')).map((node) => node.textContent)
    expect(terms).toContain('Estimate')
    const value = Array.from(container.querySelectorAll('dd')).find((node) =>
      node.textContent?.includes('2.5h')
    )
    expect(value?.textContent).toBe('2.5h/8h')
  })

  it('shows a single figure when only one of the two is known', async () => {
    await mount({ ...DETAIL, task: { ...TASK, estimate: 8 } })

    const value = Array.from(container.querySelectorAll('dd')).find((node) =>
      node.textContent?.includes('8h')
    )
    expect(value?.textContent).toBe('8h')
  })

  it('drops the effort row when the instance reports neither figure', async () => {
    await mount()

    expect(
      Array.from(container.querySelectorAll('dt')).map((node) => node.textContent)
    ).not.toContain('Estimate')
  })
})

describe('ActiveCollab task pane comment actions', () => {
  it('offers edit and delete on the signed-in user own comment only', async () => {
    await mount()

    expect(
      commentCard('Mine to edit.').querySelector('button[aria-label="Edit comment"]')
    ).toBeTruthy()
    expect(
      commentCard('Mine to edit.').querySelector('button[aria-label="Delete comment"]')
    ).toBeTruthy()
    expect(
      commentCard('Theirs to keep.').querySelector('button[aria-label="Edit comment"]')
    ).toBeNull()
    expect(
      commentCard('Theirs to keep.').querySelector('button[aria-label="Delete comment"]')
    ).toBeNull()
  })

  it('never offers them on a comment with no attributable author', async () => {
    await mount({ ...DETAIL, comments: [{ ...MY_COMMENT, createdById: null }] })

    expect(container.querySelector('button[aria-label="Edit comment"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Delete comment"]')).toBeNull()
  })

  it('edits an own comment through the seeded editor', async () => {
    await mount()

    await click(
      commentCard('Mine to edit.').querySelector(
        'button[aria-label="Edit comment"]'
      ) as HTMLButtonElement
    )
    typeBody('Edit comment', ['Corrected.'])
    await click(buttonWith('Save', bodyEditorFrame('Edit comment')))

    expect(mocks.updateComment).toHaveBeenCalledWith({
      taskId: TASK_ID,
      commentId: MY_COMMENT.id,
      bodyHtml: '<p>Corrected.</p>'
    })
  })

  it('deletes an own comment only once the confirmation is accepted', async () => {
    await mount()

    await click(
      commentCard('Mine to edit.').querySelector(
        'button[aria-label="Delete comment"]'
      ) as HTMLButtonElement
    )
    expect(mocks.deleteComment).not.toHaveBeenCalled()

    await click(buttonWith('Delete'))

    expect(mocks.deleteComment).toHaveBeenCalledWith({
      taskId: TASK_ID,
      commentId: MY_COMMENT.id
    })
    expect(container.textContent).not.toContain('Mine to edit.')
  })

  it('keeps the comment when the confirmation is dismissed', async () => {
    await mount()

    await click(
      commentCard('Mine to edit.').querySelector(
        'button[aria-label="Delete comment"]'
      ) as HTMLButtonElement
    )
    await click(buttonWith('Cancel'))

    expect(mocks.deleteComment).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Mine to edit.')
  })
})

describe('ActiveCollab task pane watchers', () => {
  it('subscribes the signed-in user and shows them in the stack', async () => {
    await mount()

    await click(buttonWith('Watch this task'))

    expect(mocks.setSubscription).toHaveBeenCalledWith({
      taskId: TASK_ID,
      userId: VIEWER_ID,
      subscribed: true
    })
    expect(buttonWith('Stop watching')).toBeTruthy()
  })

  it('unsubscribes a member who is already watching', async () => {
    await mount()

    const row = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
    ).find((candidate) => candidate.textContent?.includes(ADA.name))
    expect(row?.getAttribute('aria-pressed')).toBe('true')
    await click(row as HTMLButtonElement)

    expect(mocks.setSubscription).toHaveBeenCalledWith({
      taskId: TASK_ID,
      userId: ADA.id,
      subscribed: false
    })
  })

  it('reads the project membership once for the people it names', async () => {
    await mount()

    expect(mocks.listProjectMembers).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="activecollab-task-watchers"]')?.textContent).toBe(
      'AL'
    )
  })
})
