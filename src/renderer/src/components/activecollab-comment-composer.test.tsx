// @vitest-environment happy-dom
//
// Mounts the composer against the REAL store slice with only the runtime client mocked, so the
// "people are fetched lazily, and once per project" claim is proved through the cache that
// actually enforces it rather than against a stub action.
//
// `useEditor` is wrapped rather than stubbed: happy-dom does not implement contenteditable, so
// text cannot be produced by dispatching key events at the DOM. The wrapper is a pass-through that
// keeps a handle on the real editor, which is what lets a test type. Everything else — the menu,
// the key handling, the serialiser, the store — is the shipping code.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type * as TiptapReact from '@tiptap/react'
import type { Editor } from '@tiptap/react'

import { createActiveCollabSlice } from '@/store/slices/activecollab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { clearActiveCollabInflightReads } from '@/store/slices/activecollab-reads'
import type { AppState } from '@/store/types'
import type {
  ActiveCollabResult,
  ActiveCollabStagedFile,
  ActiveCollabUploadedFile
} from '../../../shared/activecollab-api-types'
import type { NativeFileDropPayload } from '../../../shared/native-file-drop'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

type StagedFile = ActiveCollabStagedFile
type UsersResult = ActiveCollabResult<ActiveCollabUser[]>
type StagedResult = ActiveCollabResult<ActiveCollabStagedFile[]>
type UploadResult = ActiveCollabResult<ActiveCollabUploadedFile[]>

const holder = vi.hoisted(() => ({
  state: null as unknown,
  editor: null as Editor | null,
  listUsers: vi.fn<() => Promise<UsersResult>>(),
  listProjectMembers: vi.fn<(args: { projectId: number }) => Promise<UsersResult>>(),
  pickAttachments: vi.fn<() => Promise<StagedResult>>(),
  describeAttachments: vi.fn<(args: { paths: string[] }) => Promise<StagedResult>>(),
  uploadAttachments: vi.fn<(args: { paths: string[] }) => Promise<UploadResult>>(),
  drop: null as ((payload: NativeFileDropPayload) => void) | null
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(holder.state)
}))

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof TiptapReact>()
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const instance = actual.useEditor(...args)
      holder.editor = instance
      return instance
    }
  }
})

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabStatus: vi.fn(),
  activeCollabConnect: vi.fn(),
  activeCollabDisconnect: vi.fn(),
  activeCollabListAssignedTasks: vi.fn(),
  activeCollabListProjects: vi.fn(),
  activeCollabGetTaskDetail: vi.fn(),
  activeCollabGetAttachmentImage: vi.fn(),
  activeCollabUpdateTask: vi.fn(),
  activeCollabCompleteTask: vi.fn(),
  activeCollabReopenTask: vi.fn(),
  activeCollabPostComment: vi.fn(),
  activeCollabListLabels: vi.fn(),
  activeCollabListUsers: () => holder.listUsers(),
  activeCollabListProjectMembers: (args: { projectId: number }) => holder.listProjectMembers(args),
  activeCollabDownloadAttachment: vi.fn(),
  activeCollabPickCommentAttachments: () => holder.pickAttachments(),
  activeCollabDescribeCommentAttachments: (args: { paths: string[] }) =>
    holder.describeAttachments(args),
  activeCollabUploadCommentAttachments: (args: { paths: string[] }) =>
    holder.uploadAttachments(args)
}))

import { ActiveCollabCommentComposer } from './activecollab-comment-composer'

const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace', avatarUrl: null }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing', avatarUrl: null }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese', avatarUrl: null }
/** On the instance roster but NOT on the project: the person scoping has to keep out. */
const GRACE: ActiveCollabUser = { id: 7, name: 'Grace Hopper', avatarUrl: null }

const PROJECT_ID = 5937

/** Jake is the CONNECTED user throughout, so every suggestion list must exclude him. */
const CONNECTION = {
  instanceUrl: 'https://projects.example.com',
  userId: JAKE.id,
  userName: JAKE.name,
  userEmail: 'jake@example.com'
}

let container: HTMLDivElement
let root: Root
let posted: string[]
let postedCodes: string[][]
/** Flipped by the "post fails after the upload landed" case; every other test posts cleanly. */
let postLands: boolean

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabInflightReads()
  holder.editor = null
  holder.listUsers.mockReset()
  holder.listUsers.mockResolvedValue({ ok: true, value: [ADA, ALAN, GRACE, JAKE] })
  holder.listProjectMembers.mockReset()
  holder.listProjectMembers.mockResolvedValue({ ok: true, value: [ADA, ALAN, JAKE] })
  holder.pickAttachments.mockReset().mockResolvedValue({ ok: true, value: [] })
  holder.describeAttachments.mockReset().mockResolvedValue({ ok: true, value: [] })
  holder.uploadAttachments.mockReset().mockResolvedValue({ ok: true, value: [] })
  holder.drop = null
  // The native drop router lives in preload; the composer only subscribes to what it relays.
  window.api = {
    ui: {
      onFileDrop: (callback: (payload: NativeFileDropPayload) => void) => {
        holder.drop = callback
        return () => {
          holder.drop = null
        }
      }
    }
  } as never
  const store = create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a),
        activeCollabStatus: { configured: true, connection: CONNECTION, reason: '' }
      }) as AppState
  )
  holder.state = store.getState()
  posted = []
  postedCodes = []
  postLands = true
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

async function render({
  projectId,
  disabled,
  busy
}: {
  projectId: number | null
  disabled: boolean
  busy: boolean
}): Promise<void> {
  await act(async () => {
    root.render(
      // The link bubble is built from `RichMarkdownLinkBubble`, whose actions are tooltipped; the
      // app mounts one provider at the root (App.tsx), so the test supplies the same context.
      <TooltipProvider>
        <ActiveCollabCommentComposer
          projectId={projectId}
          disabled={disabled}
          busy={busy}
          onSubmit={async (bodyHtml, attachmentCodes) => {
            posted.push(bodyHtml)
            postedCodes.push(attachmentCodes)
            return postLands
          }}
        />
      </TooltipProvider>
    )
  })
}

/** The collapsed prompt, or null once the composer is open. */
function promptButton(): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Write a comment...'
    ) ?? null
  )
}

/** Tolerant of an already-open composer, so a re-`mount` in one test does not have to care. */
async function openComposer(): Promise<void> {
  const prompt = promptButton()
  if (prompt === null) {
    return
  }
  await act(async () => {
    prompt.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/**
 * Opens the composer by default: the collapsed prompt is the resting state, but almost every test
 * here is about the open editor. A disabled mount opens FIRST and takes the disabled props after,
 * because the prompt is disabled while a write is in flight — you cannot start a comment mid-write,
 * which is the behaviour, not an obstacle to work around.
 */
async function mount({
  projectId = PROJECT_ID as number | null,
  disabled = false,
  busy = false,
  expanded = true
} = {}): Promise<void> {
  await render({
    projectId,
    disabled: expanded ? false : disabled,
    busy: expanded ? false : busy
  })
  if (!expanded) {
    return
  }
  await openComposer()
  if (disabled || busy) {
    await render({ projectId, disabled, busy })
  }
}

function editor(): Editor {
  if (holder.editor === null) {
    throw new Error('composer editor missing')
  }
  return holder.editor
}

/** Types characters at the caret. Text, never markup — this is somebody at a keyboard. */
async function type(text: string): Promise<void> {
  await act(async () => {
    editor().commands.insertContent([{ type: 'text', text }])
  })
}

async function press(key: string): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  await act(async () => {
    editor().view.dom.dispatchEvent(event)
  })
  return event.defaultPrevented
}

function options(): string[] {
  return [...container.querySelectorAll('[role="option"]')].map((node) => node.textContent ?? '')
}

function selectedOption(): string | null {
  return container.querySelector('[role="option"][aria-selected="true"]')?.textContent ?? null
}

async function clickOption(index: number): Promise<void> {
  const option = container.querySelectorAll('[role="option"]')[index]
  await act(async () => {
    option.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
  })
}

function toolbarButton(label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (button === null) {
    throw new Error(`toolbar button ${label} missing`)
  }
  return button
}

function submitButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === 'Comment'
  )
  if (button === undefined) {
    throw new Error('comment button missing')
  }
  return button
}

function cancelButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === 'Cancel'
  )
  if (button === undefined) {
    throw new Error('cancel button missing')
  }
  return button
}

async function post(): Promise<void> {
  await act(async () => {
    submitButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  // The click starts an upload-then-post chain; a second flush lets both awaits settle.
  await act(async () => {})
}

function staged(name: string, size: number, rejected: 'too-large' | null = null): StagedFile {
  return { path: `/tmp/${name}`, name, size, rejected }
}

function attachButton(): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === 'Attach Files'
  )
  if (button === undefined) {
    throw new Error('attach button missing')
  }
  return button
}

/** Every staged row's visible text, so a name, a size and a refusal are all covered at once. */
function stagedRows(): string[] {
  return [...container.querySelectorAll('li')].map((row) => row.textContent?.trim() ?? '')
}

function stripAlert(): string | null {
  return container.querySelector('[role="alert"]')?.textContent ?? null
}

async function attachViaPicker(...files: StagedFile[]): Promise<void> {
  holder.pickAttachments.mockResolvedValue({ ok: true, value: files })
  await act(async () => {
    attachButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {})
}

async function dropFiles(target: string, paths: string[]): Promise<void> {
  await act(async () => {
    holder.drop?.({ paths, target } as NativeFileDropPayload)
  })
  await act(async () => {})
}

describe('ActiveCollabCommentComposer layout', () => {
  it('stacks the Comment button beneath the input, right-aligned', async () => {
    await mount()
    const field = container.querySelector('.activecollab-comment-editor')
    const buttonRow = submitButton().parentElement

    // Regression guard: the button used to sit `self-end` BESIDE the field, which left it floating
    // against the field's bottom corner aligned to nothing. The footer row now also carries the
    // attach action so the whole composer reads as one framed control.
    expect(field).not.toBeNull()
    expect(buttonRow?.contains(field!)).toBe(false)
    expect(
      field!.compareDocumentPosition(buttonRow!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(buttonRow?.className).toContain('justify-between')
    expect(buttonRow?.textContent).toContain('Attach Files')
  })

  it('carries the placeholder onto the field, which is what the empty-state CSS reads', async () => {
    await mount()
    const firstParagraph = container.querySelector('.activecollab-comment-editor p')

    // Both halves of the contract with rich-markdown-editor.css: the rule is keyed on
    // `p.is-editor-empty:first-child::before` and prints `attr(data-placeholder)`. Lose either and
    // the field is silently blank with no hint of what it is for.
    expect(firstParagraph?.getAttribute('data-placeholder')).toBe('Add an ActiveCollab comment...')
    expect(firstParagraph?.classList.contains('is-editor-empty')).toBe(true)

    await type('now it has words')
    expect(
      container
        .querySelector('.activecollab-comment-editor p')
        ?.classList.contains('is-editor-empty')
    ).toBe(false)
  })

  it('offers exactly the three controls the schema can represent', async () => {
    await mount()
    const labels = [...container.querySelectorAll('button[aria-label]')].map((button) =>
      button.getAttribute('aria-label')
    )

    expect(labels).toEqual(['Bold', 'Italic', 'Link'])
  })
})

describe('ActiveCollabCommentComposer roster fetching', () => {
  it('never asks for anyone while the author writes a comment with no @', async () => {
    await mount()
    await type('Shipped the header fix')

    expect(holder.listProjectMembers).not.toHaveBeenCalled()
    expect(holder.listUsers).not.toHaveBeenCalled()
    expect(options()).toEqual([])
  })

  it('fetches project members once, however many characters follow the @', async () => {
    await mount()
    await type('Ping @')
    await type('a')
    await type('l')
    await type('a')

    expect(holder.listProjectMembers).toHaveBeenCalledTimes(1)
    // Members answered, so the instance-wide roster is never touched.
    expect(holder.listUsers).not.toHaveBeenCalled()
  })

  it('falls back to the full roster when the project members cannot be read', async () => {
    // An empty menu would read as "nobody exists" and block a legitimate mention, so a failed
    // members read must widen to the instance roster rather than suggesting no one.
    holder.listProjectMembers.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'members unavailable',
      status: 500
    })

    await mount()
    await type('Ping @')

    expect(holder.listUsers).toHaveBeenCalledTimes(1)
    expect(options().length).toBeGreaterThan(0)
  })
})

describe('ActiveCollabCommentComposer menu', () => {
  it('opens on a bare @ and lists people, never the connected user', async () => {
    await mount()
    await type('Ping @')

    expect(options()).toEqual(['Ada Lovelace', 'Alan Turing'])
  })

  it('filters by the typed query', async () => {
    await mount()
    await type('Ping @ada')

    expect(options()).toEqual(['Ada Lovelace'])
  })

  it('stays shut when nothing matches, rather than showing an empty box', async () => {
    await mount()
    await type('Ping @zzz')

    expect(options()).toEqual([])
  })

  it('stays shut for an email address, because that @ is not a mention', async () => {
    await mount()
    await type('mail ada@efront')

    expect(options()).toEqual([])
  })

  it('moves the highlight with Down and Up, wrapping at both ends', async () => {
    await mount()
    await type('Ping @')

    expect(selectedOption()).toBe('Ada Lovelace')
    expect(await press('ArrowDown')).toBe(true)
    expect(selectedOption()).toBe('Alan Turing')
    await press('ArrowDown')
    expect(selectedOption()).toBe('Ada Lovelace')
    await press('ArrowUp')
    expect(selectedOption()).toBe('Alan Turing')
  })

  it('accepts the highlighted person on Enter, inserting a chip and closing the menu', async () => {
    await mount()
    await type('Ping @a')
    await press('ArrowDown')
    expect(await press('Enter')).toBe(true)

    expect(editor().getText()).toBe('Ping @Alan Turing ')
    expect(options()).toEqual([])
  })

  it('renders the accepted person as a highlighted chip, not as text', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    // The class is the CSS hook that tints the chip to match how a mention renders once posted.
    // Rename it without renaming the rule and the highlight silently disappears.
    const chip = container.querySelector('span.activecollab-comment-mention')

    expect(chip?.textContent).toBe('@Ada Lovelace')
    expect(container.querySelectorAll('span.activecollab-comment-mention')).toHaveLength(1)
  })

  it('accepts on Tab as well', async () => {
    await mount()
    await type('Ping @ada')
    await press('Tab')

    expect(editor().getText()).toBe('Ping @Ada Lovelace ')
  })

  it('accepts on click, and the caret stays in the editor', async () => {
    await mount()
    await type('Ping @')
    await clickOption(1)

    expect(editor().getText()).toBe('Ping @Alan Turing ')
    expect(options()).toEqual([])
  })

  it('leaves the caret after the inserted chip and the rest of the draft untouched', async () => {
    await mount()
    await type('Ping @ad about the header')
    await act(async () => {
      // Caret parked immediately after "@ad", with trailing text the pick must not disturb.
      editor().commands.setTextSelection(9)
    })
    await press('Enter')

    expect(editor().getText()).toBe('Ping @Ada Lovelace about the header')
    // 7, not 8: the draft already had a space at the caret, so accepting did not add a second one.
    expect(editor().state.selection.from).toBe(7)
  })

  it('stays dismissed after Escape, so Escape is not undone by the next keystroke', async () => {
    await mount()
    await type('Ping @a')

    expect(await press('Escape')).toBe(true)
    expect(options()).toEqual([])

    // Still the same `@`: the author dismissed this token deliberately and kept typing.
    await type('l')
    expect(options()).toEqual([])
  })

  it('reopens on a fresh @ typed after a dismissal', async () => {
    await mount()
    await type('Ping @a')
    await press('Escape')

    await type(' and @al')
    expect(options()).toEqual(['Alan Turing'])
  })

  it('closes when the field loses focus, so the menu cannot sit over the thread below it', async () => {
    await mount()
    await type('Ping @a')

    expect(options()).not.toEqual([])
    // A real DOM blur, so TipTap's own focus plugin is what reports it.
    await act(async () => {
      editor().view.dom.dispatchEvent(new FocusEvent('blur'))
    })

    expect(options()).toEqual([])
  })

  it('does not hijack Enter when no menu is open, so a plain Enter still starts a new line', async () => {
    await mount()
    await type('First line')
    await press('Enter')
    await type('Second line')

    expect(editor().state.doc.childCount).toBe(2)
    expect(posted).toEqual([])
  })

  it('does not swallow Escape when no menu is open, so the pane still sees it', async () => {
    await mount()
    await type('First line')

    expect(await press('Escape')).toBe(false)
  })
})

describe('ActiveCollabCommentComposer formatting', () => {
  it('posts bold as <strong> and nothing more', async () => {
    await mount()
    await type('make this bold')
    await act(async () => {
      editor().commands.setTextSelection({ from: 1, to: 15 })
    })
    await act(async () => {
      toolbarButton('Bold').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await post()

    expect(posted).toEqual(['<p><strong>make this bold</strong></p>'])
  })

  it('posts italics as <em> and nothing more', async () => {
    await mount()
    await type('lean on this')
    await act(async () => {
      editor().commands.setTextSelection({ from: 1, to: 13 })
    })
    await act(async () => {
      toolbarButton('Italic').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await post()

    expect(posted).toEqual(['<p><em>lean on this</em></p>'])
  })

  it('posts a link as a bare href anchor', async () => {
    await mount()
    await type('the docs')
    await act(async () => {
      editor()
        .chain()
        .setTextSelection({ from: 1, to: 9 })
        .setLink({ href: 'https://efront.com.au/docs' })
        .run()
    })
    await post()

    expect(posted).toEqual(['<p><a href="https://efront.com.au/docs">the docs</a></p>'])
  })

  it('escapes typed markup instead of rendering it', async () => {
    await mount()
    await type('<b>not bold</b>')
    await post()

    expect(posted).toEqual(['<p>&lt;b&gt;not bold&lt;/b&gt;</p>'])
  })
})

describe('ActiveCollabCommentComposer collapsed state', () => {
  it('rests as a one-line prompt and builds no editor until it is opened', async () => {
    await mount({ expanded: false })

    expect(promptButton()).not.toBeNull()
    // The point of the collapse: a pane nobody is replying on pays for no editor at all.
    expect(holder.editor).toBeNull()
    expect(container.querySelector('.activecollab-comment-editor')).toBeNull()
  })

  it('expands into the composer, with the caret already in the field', async () => {
    await mount({ expanded: false })
    await openComposer()

    expect(promptButton()).toBeNull()
    expect(container.querySelector('.activecollab-comment-editor')).not.toBeNull()
    expect(editor().isFocused).toBe(true)
  })

  it('collapses on Cancel and discards the draft', async () => {
    await mount()
    await type('half a thought')

    await act(async () => {
      cancelButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(promptButton()).not.toBeNull()
    expect(posted).toEqual([])

    await openComposer()
    expect(editor().getText()).toBe('')
  })

  it('stays open when the post is refused, so the words are still there to retry', async () => {
    postLands = false
    await mount()
    await type('this will not land')
    await post()

    expect(promptButton()).toBeNull()
    expect(editor().getText()).toBe('this will not land')
  })

  it('refuses to open while a write is in flight', async () => {
    await mount({ expanded: false, disabled: true })

    expect(promptButton()?.disabled).toBe(true)
  })
})

describe('ActiveCollabCommentComposer posting', () => {
  it('posts the picked mention as a new_mention span the server recognises', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await type('please look')
    await post()

    expect(posted).toEqual([
      '<p>Ping <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span>' +
        ' please look</p>'
    ])
  })

  it('drops a mention the author deleted before posting', async () => {
    // The improvement over substituting picked names into the text: the mention IS the chip, so
    // what the author can see is exactly what gets sent. There is no pick list left to disagree.
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await type('never mind')
    await act(async () => {
      editor().chain().setNodeSelection(6).deleteSelection().run()
    })
    await post()

    expect(posted[0]).not.toContain('new_mention')
    expect(posted[0]).not.toContain('Ada Lovelace')
  })

  it('never mints a mention from a hand-typed name, however many times it appears', async () => {
    // The documented sharp edge of the old name-substitution serialiser, now gone: a second typed
    // "@Ada Lovelace" also became a mention for the picked Ada, including when a different Ada was
    // meant. Nothing here is matched by name.
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await type('and also @Ada Lovelace')
    await press('Escape')
    await post()

    expect(posted[0].match(/new_mention/g)).toHaveLength(1)
  })

  it('collapses on a landed post, and reopening inherits nothing from the sent draft', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await post()

    // A landed post closes the composer, so the draft is not merely cleared — the editor holding
    // it is gone. The mention cannot survive into the next comment because nothing survives.
    expect(promptButton()).not.toBeNull()

    await openComposer()
    expect(editor().getText()).toBe('')
    expect(submitButton().disabled).toBe(true)

    // A second comment that happens to repeat the name must NOT become a mention.
    await type('Ada Lovelace already reviewed it')
    await post()

    expect(posted[1]).toBe('<p>Ada Lovelace already reviewed it</p>')
  })

  it('refuses to post a draft of nothing but whitespace', async () => {
    await mount()
    await type('   ')
    await post()

    expect(posted).toEqual([])
    expect(submitButton().disabled).toBe(true)
  })
})

describe('ActiveCollabCommentComposer while a write is in flight', () => {
  it('disables the editor, the formatting controls and the button together', async () => {
    await mount({ disabled: true, busy: true })

    expect(editor().isEditable).toBe(false)
    expect(toolbarButton('Bold').disabled).toBe(true)
    expect(toolbarButton('Italic').disabled).toBe(true)
    expect(toolbarButton('Link').disabled).toBe(true)
    expect(submitButton().disabled).toBe(true)
  })

  it('re-enables everything once the write lands', async () => {
    await mount({ disabled: true, busy: true })
    await mount({ disabled: false, busy: false })

    expect(editor().isEditable).toBe(true)
    expect(toolbarButton('Bold').disabled).toBe(false)
  })
})

describe('ActiveCollabCommentComposer attachments', () => {
  const AC_PNG = { path: '/tmp/ac.png', name: 'ac.png', size: 1927, rejected: null }
  const CODE = 'FVz6RyPOo4mwh4NUVxoPLjg0tcHuBQt8AS2ggGVv'

  function uploaded(...codes: string[]): UploadResult {
    return {
      ok: true,
      value: codes.map((code, index) => ({
        path: `/tmp/f${index}`,
        name: `f${index}`,
        size: 1,
        code
      }))
    }
  }

  it('marks itself as the drop target the preload router addresses, and lights up on a file drag', async () => {
    // Without the marker the router resolves the drop to whatever ancestor claims it — usually the
    // editor — and the files never reach this composer.
    await mount()
    const surface = container.querySelector<HTMLElement>(
      '[data-native-file-drop-target="activecollab-comment"]'
    )
    expect(surface).not.toBeNull()

    const frame = surface?.firstElementChild as HTMLElement
    const drag = new Event('dragover', { bubbles: true })
    Object.defineProperty(drag, 'dataTransfer', { value: { types: ['Files'] } })
    await act(async () => {
      surface?.dispatchEvent(drag)
    })
    expect(frame.className).toContain('ring-ring/30')

    // The router swallows the drop in the capture phase, so the highlight clears from there too.
    await act(async () => {
      document.dispatchEvent(new Event('drop', { bubbles: true }))
    })
    expect(frame.className).not.toContain('ring-ring/30')
  })

  it('stages a picked file with its name and its size', async () => {
    await mount()
    await attachViaPicker(AC_PNG)

    expect(stagedRows()).toEqual(['ac.png1.88 KB'])
  })

  it('stages a dropped file, and ignores a drop addressed to any other target', async () => {
    await mount()
    holder.describeAttachments.mockResolvedValue({ ok: true, value: [AC_PNG] })

    // The chat composer's own drop target must not reach this composer.
    await dropFiles('composer', ['/tmp/ac.png'])
    expect(holder.describeAttachments).not.toHaveBeenCalled()
    expect(stagedRows()).toEqual([])

    await dropFiles('activecollab-comment', ['/tmp/ac.png'])
    expect(holder.describeAttachments).toHaveBeenCalledWith({ paths: ['/tmp/ac.png'] })
    expect(stagedRows()).toEqual(['ac.png1.88 KB'])
  })

  it('stages the same path once, however many times it is attached', async () => {
    await mount()
    await attachViaPicker(AC_PNG)
    await attachViaPicker(AC_PNG)

    expect(stagedRows()).toHaveLength(1)
  })

  it('removes a staged file before posting, and then posts without it', async () => {
    await mount()
    await attachViaPicker(AC_PNG, staged('brief.pdf', 2048))
    holder.uploadAttachments.mockResolvedValue(uploaded(CODE))

    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove ac.png"]')
    await act(async () => {
      remove?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(stagedRows()).toEqual(['brief.pdf2.00 KB'])
    await type('Shipped')
    await post()
    expect(holder.uploadAttachments).toHaveBeenCalledWith({ paths: ['/tmp/brief.pdf'] })
  })

  it('uploads first and sends the codes with the comment', async () => {
    await mount()
    await attachViaPicker(AC_PNG)
    holder.uploadAttachments.mockResolvedValue(uploaded(CODE))

    await type('Shipped')
    await post()

    expect(holder.uploadAttachments).toHaveBeenCalledWith({ paths: ['/tmp/ac.png'] })
    expect(posted).toEqual(['<p>Shipped</p>'])
    expect(postedCodes).toEqual([[CODE]])
  })

  it('sends no codes and uploads nothing when nothing is staged', async () => {
    await mount()
    await type('Shipped')
    await post()

    expect(holder.uploadAttachments).not.toHaveBeenCalled()
    expect(postedCodes).toEqual([[]])
  })

  it('clears the staged files with the draft once the comment lands', async () => {
    await mount()
    await attachViaPicker(AC_PNG)
    holder.uploadAttachments.mockResolvedValue(uploaded(CODE))

    await type('Shipped')
    await post()

    expect(stagedRows()).toEqual([])
    expect(editor().getText()).toBe('')
  })

  it('keeps the typed comment and the staged files when the upload is refused', async () => {
    // The one outcome that must never cost someone their words: the instance answered 200 with an
    // empty array, main called it a refusal, and nothing may be posted or cleared.
    await mount()
    await attachViaPicker(AC_PNG)
    holder.uploadAttachments.mockResolvedValue({
      ok: false,
      kind: 'invalid-request',
      error: 'ActiveCollab rejected the upload of "ac.png".',
      status: null
    })

    await type('Shipped the header fix')
    await post()

    expect(posted).toEqual([])
    expect(editor().getText()).toBe('Shipped the header fix')
    expect(stagedRows()).toEqual(['ac.png1.88 KB'])
    expect(stripAlert()).toContain('rejected the upload')
  })

  it('says so distinctly when the files uploaded but the comment did not post', async () => {
    await mount()
    await attachViaPicker(AC_PNG)
    holder.uploadAttachments.mockResolvedValue(uploaded(CODE))
    postLands = false

    await type('Shipped')
    await post()

    expect(postedCodes).toEqual([[CODE]])
    expect(stripAlert()).toContain('uploaded but the comment did not post')
    expect(editor().getText()).toBe('Shipped')
    expect(stagedRows()).toEqual(['ac.png1.88 KB'])
  })

  it('leaves a failed post with no attachments to the pane, not to the strip', async () => {
    await mount()
    postLands = false

    await type('Shipped')
    await post()

    expect(stripAlert()).toBeNull()
    expect(editor().getText()).toBe('Shipped')
  })

  it('refuses to post while an upload is in flight', async () => {
    await mount()
    await attachViaPicker(AC_PNG)
    const pending = Promise.withResolvers<UploadResult>()
    holder.uploadAttachments.mockReturnValue(pending.promise)

    await type('Shipped')
    await act(async () => {
      submitButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(submitButton().disabled).toBe(true)
    expect(attachButton().disabled).toBe(true)
    expect(posted).toEqual([])

    pending.resolve(uploaded(CODE))
    await act(async () => {})
    expect(posted).toEqual(['<p>Shipped</p>'])
  })

  it('refuses to post while a file that can never be sent is staged', async () => {
    await mount()
    await attachViaPicker(staged('huge.bin', 70_000_000, 'too-large'))

    await type('Shipped')

    expect(stagedRows()).toEqual(['huge.binToo large to send'])
    expect(submitButton().disabled).toBe(true)
    await post()
    expect(holder.uploadAttachments).not.toHaveBeenCalled()
    expect(posted).toEqual([])
  })

  it('reports a refused picker without staging anything', async () => {
    await mount()
    holder.pickAttachments.mockResolvedValue({
      ok: false,
      kind: 'not-configured',
      error: 'Reconnect ActiveCollab.',
      status: null
    })

    await act(async () => {
      attachButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {})

    expect(stagedRows()).toEqual([])
    expect(stripAlert()).toBe('Reconnect ActiveCollab.')
  })
})
