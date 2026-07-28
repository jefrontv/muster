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
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

type UsersResult = ActiveCollabResult<ActiveCollabUser[]>

const holder = vi.hoisted(() => ({
  state: null as unknown,
  editor: null as Editor | null,
  listUsers: vi.fn<() => Promise<UsersResult>>(),
  listProjectMembers: vi.fn<(args: { projectId: number }) => Promise<UsersResult>>()
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
  activeCollabListProjectMembers: (args: { projectId: number }) => holder.listProjectMembers(args)
}))

import { ActiveCollabCommentComposer } from './activecollab-comment-composer'

const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace' }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing' }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese' }
/** On the instance roster but NOT on the project: the person scoping has to keep out. */
const GRACE: ActiveCollabUser = { id: 7, name: 'Grace Hopper' }

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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabInflightReads()
  holder.editor = null
  holder.listUsers.mockReset()
  holder.listUsers.mockResolvedValue({ ok: true, value: [ADA, ALAN, GRACE, JAKE] })
  holder.listProjectMembers.mockReset()
  holder.listProjectMembers.mockResolvedValue({ ok: true, value: [ADA, ALAN, JAKE] })
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

async function mount({
  projectId = PROJECT_ID as number | null,
  disabled = false,
  busy = false
} = {}): Promise<void> {
  await act(async () => {
    root.render(
      // The link bubble is built from `RichMarkdownLinkBubble`, whose actions are tooltipped; the
      // app mounts one provider at the root (App.tsx), so the test supplies the same context.
      <TooltipProvider>
        <ActiveCollabCommentComposer
          projectId={projectId}
          disabled={disabled}
          busy={busy}
          onSubmit={(bodyHtml) => posted.push(bodyHtml)}
        />
      </TooltipProvider>
    )
  })
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

async function post(): Promise<void> {
  await act(async () => {
    submitButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ActiveCollabCommentComposer layout', () => {
  it('stacks the Comment button beneath the input, right-aligned', async () => {
    await mount()
    const field = container.querySelector('.activecollab-comment-editor')
    const buttonRow = submitButton().parentElement

    // Regression guard: the button used to sit `self-end` BESIDE the field, which left it floating
    // against the field's bottom corner aligned to nothing.
    expect(field).not.toBeNull()
    expect(buttonRow?.contains(field!)).toBe(false)
    expect(
      field!.compareDocumentPosition(buttonRow!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(buttonRow?.className).toContain('justify-end')
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

  it('clears the draft with its mentions, so the next comment does not inherit them', async () => {
    await mount()
    await type('Ping @ada')
    await press('Enter')
    await post()

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
