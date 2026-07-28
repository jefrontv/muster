// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as TiptapReact from '@tiptap/react'
import type { Editor } from '@tiptap/react'

import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'
import type {
  ActiveCollabComment,
  ActiveCollabLabel,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskUpdate,
  ActiveCollabUser
} from '../../../shared/activecollab-types'

type DetailResult = ActiveCollabResult<ActiveCollabTaskDetail>
type TaskResult = ActiveCollabResult<ActiveCollabTask | null>
type CommentResult = ActiveCollabResult<ActiveCollabComment | null>
type UpdateArgs = ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate }

const mocks = vi.hoisted(() => ({
  fetchTaskDetail:
    vi.fn<(ref: ActiveCollabTaskRef, options?: { force?: boolean }) => Promise<DetailResult>>(),
  listLabels: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabLabel[]>>>(),
  updateTask: vi.fn<(args: UpdateArgs) => Promise<TaskResult>>(),
  completeTask: vi.fn<(args: { taskId: number }) => Promise<TaskResult>>(),
  reopenTask: vi.fn<(args: { taskId: number }) => Promise<TaskResult>>(),
  postComment: vi.fn<(args: { taskId: number; bodyHtml: string }) => Promise<CommentResult>>(),
  getAttachmentImage:
    vi.fn<
      (args: { attachmentId: number }) => Promise<ActiveCollabResult<ActiveCollabAttachmentImage>>
    >(),
  listUsers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>(),
  listProjectMembers: vi.fn<() => Promise<ActiveCollabResult<ActiveCollabUser[]>>>()
}))

// Separate from `mocks`, whose every value is reset as a vi.fn in beforeEach.
//
// The comment composer is a TipTap editor and happy-dom has no contenteditable, so the only way to
// put words in it is through the editor instance. `useEditor` is wrapped, not stubbed.
const composer = vi.hoisted(() => ({ editor: null as Editor | null }))

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof TiptapReact>()
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const instance = actual.useEditor(...args)
      composer.editor = instance
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
      updateActiveCollabTask: mocks.updateTask,
      completeActiveCollabTask: mocks.completeTask,
      reopenActiveCollabTask: mocks.reopenTask,
      postActiveCollabComment: mocks.postComment,
      listActiveCollabUsers: mocks.listUsers,
      listActiveCollabProjectMembers: mocks.listProjectMembers
    })
}))

// Radix portals popover content out of the container and unmounts it while closed; a structural
// stand-in keeps the label picker in the tree so its own markup can be asserted.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

import { ActiveCollabTaskWorkspace } from './ActiveCollabTaskWorkspace'

const PROJECT_ID = 3790
const TASK_ID = 509323
const DUE_ON = new Date(2026, 6, 27).getTime()

const VOCABULARY: ActiveCollabLabel[] = [
  { id: 1, name: 'Blocked', color: '#ff0000' },
  { id: 2, name: 'Urgent', color: null },
  { id: 3, name: 'Deferred', color: '#00ff00' }
]

const TASK: ActiveCollabTask = {
  id: TASK_ID,
  projectId: PROJECT_ID,
  projectName: 'Efront Website',
  taskNumber: 42,
  name: 'Ship the ActiveCollab pane',
  bodyHtml: '<p>Ping <span class="mention mention-user">Ada Lovelace</span> when it lands.</p>',
  isCompleted: false,
  dueOn: DUE_ON,
  createdOn: null,
  updatedOn: null,
  assigneeId: 7,
  assigneeName: 'Grace Hopper',
  labels: [VOCABULARY[0], VOCABULARY[1]],
  commentCount: 1,
  urlPath: '/projects/3790/tasks/509323',
  taskListId: null
}

const COMMENT: ActiveCollabComment = {
  id: 9,
  bodyHtml: '<p>Reviewed by <span class="mention mention-user">Ada Lovelace</span>.</p>',
  bodyPlainText: 'Reviewed by Ada Lovelace.',
  createdOn: Date.UTC(2026, 6, 20, 3, 0),
  createdById: 7,
  createdByName: 'Ada Lovelace',
  attachments: []
}

const DETAIL: ActiveCollabTaskDetail = { task: TASK, comments: [COMMENT], attachments: [] }

const IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

const IMAGE_ATTACHMENT: ActiveCollabAttachment = {
  id: 249086,
  name: 'ticker-size.png',
  mimeType: 'image/png',
  size: 29789,
  isImage: true
}

const FILE_ATTACHMENT: ActiveCollabAttachment = {
  id: 249087,
  name: 'brief.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  isImage: false
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
  mocks.listLabels.mockResolvedValue({ ok: true, value: VOCABULARY })
  mocks.getAttachmentImage.mockResolvedValue({
    ok: true,
    value: { dataUrl: IMAGE_DATA_URL, mimeType: 'image/png' }
  })
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

async function mount(
  props: { projectId: number | null; taskId: number | null } = {
    projectId: PROJECT_ID,
    taskId: TASK_ID
  }
): Promise<void> {
  await act(async () => {
    root.render(<ActiveCollabTaskWorkspace {...props} />)
  })
}

function buttonWith(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text)
  )
  expect(found, `no button containing "${text}"`).toBeTruthy()
  return found as HTMLButtonElement
}

// The completion toggle is paired with the title as an icon-only checkbox, so it is named by its
// accessible label rather than by visible text.
function buttonByLabel(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(found, `no button labelled "${label}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function labelRow(name: string): HTMLButtonElement {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
  ).find((candidate) => candidate.textContent?.trim() === name)
  expect(found, `no label row for "${name}"`).toBeTruthy()
  return found as HTMLButtonElement
}

function dueDateInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')
  expect(input).toBeTruthy()
  return input as HTMLInputElement
}

function alertText(): string | null {
  return container.querySelector('[role="alert"]')?.textContent ?? null
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  act(() => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Types into the comment composer, which is a TipTap editor rather than a textarea. */
function typeComment(paragraphs: string[]): void {
  const editor = composer.editor
  if (editor === null) {
    throw new Error('comment editor missing')
  }
  act(() => {
    editor.commands.setContent({
      type: 'doc',
      content: paragraphs.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }))
    })
  })
}

describe('ActiveCollabTaskWorkspace selection', () => {
  it('renders nothing and reads nothing without a selection', async () => {
    await mount({ projectId: null, taskId: null })

    expect(container.innerHTML).toBe('')
    expect(mocks.fetchTaskDetail).not.toHaveBeenCalled()
  })

  it('renders nothing when only half a reference is supplied', async () => {
    await mount({ projectId: PROJECT_ID, taskId: null })

    expect(container.innerHTML).toBe('')
    expect(mocks.fetchTaskDetail).not.toHaveBeenCalled()
  })
})

describe('ActiveCollabTaskWorkspace load states', () => {
  it('shows a loading state until the detail read settles', async () => {
    const pending = deferred<DetailResult>()
    mocks.fetchTaskDetail.mockReturnValue(pending.promise)

    await mount()
    expect(container.querySelector('[role="status"]')).toBeTruthy()
    expect(container.textContent).not.toContain(TASK.name)

    await act(async () => {
      pending.resolve({ ok: true, value: DETAIL })
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(container.textContent).toContain(TASK.name)
  })

  it('renders the task identity, assignee, due date, and labels once loaded', async () => {
    await mount()

    expect(mocks.fetchTaskDetail).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: false }
    )
    expect(container.textContent).toContain('Ship the ActiveCollab pane')
    expect(container.textContent).toContain('Efront Website')
    expect(container.textContent).toContain('#42')
    expect(container.textContent).toContain('Grace Hopper')
    // Already anchored to the local calendar day upstream — rendered as-is, not re-shifted.
    expect(dueDateInput().value).toBe('2026-07-27')
    const chips = Array.from(container.querySelectorAll('span[style*="border-color"]'))
    expect(chips.some((chip) => chip.textContent?.includes('Blocked'))).toBe(true)
  })

  it('surfaces the shared failure copy when the detail read fails', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: false,
      kind: 'auth',
      error: 'Invalid token',
      status: 401
    })

    await mount()

    expect(alertText()).toContain('ActiveCollab rejected those credentials')
    expect(container.textContent).not.toContain(TASK.name)
  })

  it('retries a failed detail read with a forced refetch', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: false,
      kind: 'unknown',
      error: 'offline',
      status: null
    })
    await mount()
    mocks.fetchTaskDetail.mockResolvedValue({ ok: true, value: DETAIL })

    await click(buttonWith('Retry'))

    expect(mocks.fetchTaskDetail).toHaveBeenLastCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: true }
    )
    expect(container.textContent).toContain(TASK.name)
  })
})

describe('ActiveCollabTaskWorkspace label writes', () => {
  it('sends the MERGED label set when adding one label, never the addition alone', async () => {
    mocks.updateTask.mockResolvedValue({ ok: true, value: { ...TASK, labels: VOCABULARY } })
    await mount()

    await click(labelRow('Deferred'))

    expect(mocks.updateTask).toHaveBeenCalledTimes(1)
    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { labelNames: ['Blocked', 'Urgent', 'Deferred'] }
    })
  })

  it('sends the remaining labels when removing one', async () => {
    mocks.updateTask.mockResolvedValue({ ok: true, value: { ...TASK, labels: [VOCABULARY[1]] } })
    await mount()

    await click(labelRow('Blocked'))

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { labelNames: ['Urgent'] }
    })
  })
})

describe('ActiveCollabTaskWorkspace due-date writes', () => {
  it('clears a due date with an explicit null rather than an omitted key', async () => {
    mocks.updateTask.mockResolvedValue({ ok: true, value: { ...TASK, dueOn: null } })
    await mount()

    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear due date"]')
    expect(clear).toBeTruthy()
    await click(clear as HTMLButtonElement)

    const args = mocks.updateTask.mock.calls[0]?.[0]
    expect(args).toEqual({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { dueOn: null }
    })
    expect('dueOn' in (args?.update ?? {})).toBe(true)
  })

  it('writes the picked local calendar day as epoch milliseconds', async () => {
    mocks.updateTask.mockResolvedValue({ ok: true, value: TASK })
    await mount()

    typeInto(dueDateInput(), '2026-08-03')
    await act(async () => {})

    expect(mocks.updateTask).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      update: { dueOn: new Date(2026, 7, 3).getTime() }
    })
  })
})

describe('ActiveCollabTaskWorkspace write settlement', () => {
  it('refetches instead of erroring when a write lands but echoes no row', async () => {
    mocks.completeTask.mockResolvedValue({ ok: true, value: null })
    await mount()

    await click(buttonByLabel('Complete task'))

    expect(mocks.completeTask).toHaveBeenCalledWith({ taskId: TASK_ID })
    expect(mocks.fetchTaskDetail).toHaveBeenLastCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: true }
    )
    expect(alertText()).toBeNull()
    expect(container.textContent).toContain(TASK.name)
  })

  it('applies an echoed row without a second read', async () => {
    mocks.completeTask.mockResolvedValue({ ok: true, value: { ...TASK, isCompleted: true } })
    await mount()

    await click(buttonByLabel('Complete task'))

    expect(mocks.fetchTaskDetail).toHaveBeenCalledTimes(1)
    expect(buttonByLabel('Reopen task')).toBeTruthy()
  })

  it('reopens a completed task through the reopen action', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, task: { ...TASK, isCompleted: true } }
    })
    mocks.reopenTask.mockResolvedValue({ ok: true, value: TASK })
    await mount()

    await click(buttonByLabel('Reopen task'))

    expect(mocks.reopenTask).toHaveBeenCalledWith({ taskId: TASK_ID })
    expect(mocks.completeTask).not.toHaveBeenCalled()
  })

  it('surfaces a write failure without destroying the loaded task', async () => {
    mocks.completeTask.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'Task is locked',
      status: 500
    })
    await mount()

    await click(buttonByLabel('Complete task'))

    expect(alertText()).toContain('Task is locked')
    expect(container.textContent).toContain(TASK.name)
    expect(dueDateInput().value).toBe('2026-07-27')
  })

  it('disables every control while a write is in flight', async () => {
    const pending = deferred<TaskResult>()
    mocks.completeTask.mockReturnValue(pending.promise)
    await mount()

    await click(buttonByLabel('Complete task'))

    expect(buttonByLabel('Complete task').disabled).toBe(true)
    expect(dueDateInput().disabled).toBe(true)
    expect(buttonWith('Edit labels').disabled).toBe(true)
    expect(buttonByLabel('Assignee').disabled).toBe(true)
    expect(composer.editor?.isEditable).toBe(false)

    await act(async () => {
      pending.resolve({ ok: true, value: { ...TASK, isCompleted: true } })
    })

    expect(buttonByLabel('Reopen task').disabled).toBe(false)
    expect(dueDateInput().disabled).toBe(false)
    expect(buttonByLabel('Assignee').disabled).toBe(false)
  })
})

describe('ActiveCollabTaskWorkspace comments', () => {
  it('posts the composed comment as escaped HTML and appends the echoed row', async () => {
    const posted: ActiveCollabComment = {
      ...COMMENT,
      id: 10,
      bodyHtml: '<p>Shipped</p>',
      bodyPlainText: 'Shipped',
      createdByName: 'Grace Hopper'
    }
    mocks.postComment.mockResolvedValue({ ok: true, value: posted })
    await mount()

    typeComment(['Ping <b>Ada</b>', 'second line'])
    await click(buttonWith('Comment'))

    expect(mocks.postComment).toHaveBeenCalledWith({
      taskId: TASK_ID,
      bodyHtml: '<p>Ping &lt;b&gt;Ada&lt;/b&gt;</p><p>second line</p>'
    })
    expect(container.textContent).toContain('Shipped')
  })

  it('refetches when a posted comment echoes no row', async () => {
    mocks.postComment.mockResolvedValue({ ok: true, value: null })
    await mount()

    typeComment(['Shipped'])
    await click(buttonWith('Comment'))

    expect(mocks.fetchTaskDetail).toHaveBeenLastCalledWith(
      { projectId: PROJECT_ID, taskId: TASK_ID },
      { force: true }
    )
    expect(alertText()).toBeNull()
  })
})

describe('ActiveCollabTaskWorkspace provider HTML', () => {
  // One body carrying every shape the pane must handle: the two markers that need the sanitiser
  // widening, and the three payloads that must still be stripped despite it.
  const hostile =
    '<p>Ping <span class="mention mention-user">Ada Lovelace</span> now.</p>' +
    '<aside class="callout-wrapper aside-note"><div class="callout-content">' +
    '<p>Prototype the second step.</p></div></aside>' +
    '<script>globalThis.activeCollabPwned = true</script>' +
    '<img src="https://cdn.example.com/x.png" onerror="globalThis.activeCollabPwned = true">' +
    '<a href="javascript:globalThis.activeCollabPwned = true">tap</a>' +
    '<aside class="callout-wrapper" onclick="globalThis.activeCollabPwned = true">' +
    '<script>globalThis.activeCollabPwned = true</script>hostile aside</aside>'

  async function mountHostile(): Promise<void> {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: {
        task: { ...TASK, bodyHtml: hostile },
        comments: [{ ...COMMENT, bodyHtml: hostile }],
        attachments: []
      }
    })
    await mount()
  }

  it('renders a mention as a distinct chip in both the body and a comment', async () => {
    await mountHostile()

    const mentions = Array.from(container.querySelectorAll('[data-activecollab-mention]'))
    expect(mentions).toHaveLength(2)
    for (const mention of mentions) {
      expect(mention.textContent).toBe('Ada Lovelace')
      // Distinct, not indistinguishable body text.
      expect(mention.className).toContain('text-primary')
      expect(mention.className).toContain('bg-primary/10')
    }
  })

  it('renders an ActiveCollab callout as its own note block', async () => {
    await mountHostile()

    const callouts = Array.from(container.querySelectorAll('[data-activecollab-callout]'))
    expect(callouts.length).toBeGreaterThanOrEqual(2)
    expect(callouts[0]?.textContent).toContain('Prototype the second step.')
    expect(callouts[0]?.className).toContain('border-l-primary/60')
  })

  it('still strips scripts, event handlers and javascript: URLs after the schema widening', async () => {
    await mountHostile()

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.querySelector('[onclick]')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
    expect(container.innerHTML).not.toContain('onclick')
    const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) =>
      (anchor.getAttribute('href') ?? '').toLowerCase()
    )
    expect(hrefs.some((href) => href.startsWith('javascript:'))).toBe(false)
    expect((globalThis as Record<string, unknown>).activeCollabPwned).toBeUndefined()
  })

  it('never lets provider HTML borrow an app class, including on the hostile aside', async () => {
    await mountHostile()

    // The hostile aside still renders its text, but as the app's callout — never with its own class.
    expect(container.textContent).toContain('hostile aside')
    expect(container.innerHTML).not.toContain('callout-wrapper')
    expect(container.innerHTML).not.toContain('mention-user')
  })

  it('drops instance-hosted inline images and keeps third-party ones', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: {
        task: {
          ...TASK,
          bodyHtml:
            '<p><img src="https://projects.efront.com.au/api/v1/attachments/249086/download?intent=--DOWNLOAD-TOKEN--" alt="instance"></p>' +
            '<p><img src="/uploads/relative.png" alt="relative"></p>' +
            '<p><img src="https://cdn.example.com/logo.png" alt="third party"></p>'
        },
        comments: [],
        attachments: []
      }
    })

    await mount()

    // Instance images cannot authenticate from the renderer, so they never reach the DOM as a
    // broken icon; the authenticated attachment grid is the only place they render.
    expect(
      Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    ).toEqual(['https://cdn.example.com/logo.png'])
  })
})

describe('ActiveCollabTaskWorkspace attachments', () => {
  it('inlines an image attachment from the fetched data URL, fetching it once', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, attachments: [IMAGE_ATTACHMENT] }
    })

    await mount()

    const image = container.querySelector<HTMLImageElement>(`img[alt="${IMAGE_ATTACHMENT.name}"]`)
    expect(image?.getAttribute('src')).toBe(IMAGE_DATA_URL)
    expect(mocks.getAttachmentImage).toHaveBeenCalledTimes(1)
    expect(mocks.getAttachmentImage).toHaveBeenCalledWith({ attachmentId: IMAGE_ATTACHMENT.id })
  })

  it('does not refetch an inlined image when the pane re-renders', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, attachments: [IMAGE_ATTACHMENT] }
    })

    await mount()
    await mount()
    await mount()

    expect(mocks.getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('reports a failed image without blanking the task body', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, attachments: [IMAGE_ATTACHMENT] }
    })
    mocks.getAttachmentImage.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'attachment 249086 is gone',
      status: 404
    })

    await mount()

    expect(alertText()).toContain('attachment 249086 is gone')
    expect(container.querySelector(`img[alt="${IMAGE_ATTACHMENT.name}"]`)).toBeNull()
    // The body — and its mention — survive a failed transfer.
    expect(container.textContent).toContain('when it lands')
    expect(container.querySelectorAll('[data-activecollab-mention]').length).toBeGreaterThan(0)
  })

  it('renders a non-image attachment as a download button and never fetches it as an image', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, attachments: [FILE_ATTACHMENT] }
    })

    await mount()

    const chip = container.querySelector('[data-activecollab-attachment-chip]')
    expect(chip?.textContent).toContain(FILE_ATTACHMENT.name)
    // A link would need a tokenised instance URL in the DOM; the download runs in main instead.
    expect(chip?.querySelector('a')).toBeNull()
    expect(chip?.querySelector<HTMLButtonElement>('button')?.getAttribute('aria-label')).toBe(
      `Download ${FILE_ATTACHMENT.name}`
    )
    expect(mocks.getAttachmentImage).not.toHaveBeenCalled()
  })

  it('inlines attachments hanging off a comment', async () => {
    mocks.fetchTaskDetail.mockResolvedValue({
      ok: true,
      value: { ...DETAIL, comments: [{ ...COMMENT, attachments: [IMAGE_ATTACHMENT] }] }
    })

    await mount()

    expect(
      container.querySelector<HTMLImageElement>(`img[alt="${IMAGE_ATTACHMENT.name}"]`)?.src
    ).toBe(IMAGE_DATA_URL)
  })
})
