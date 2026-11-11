// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor
} from '@testing-library/react'
import type React from 'react'
import type { Editor } from '@tiptap/react'
import type * as TiptapReact from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { draftFixture } from '../../../../shared/bots-comment-draft-fixture'
import type {
  BotsCommentDraft,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'
import type { PreloadApi } from '../../../../preload/api-types'
import { ACTIVECOLLAB_MENTION_NODE_NAME } from '../activecollab-comment-mention-node'
import { BotsCommentDraftCard } from './BotsCommentDraftCard'
import { BotsCommentDraftsPanel } from './BotsCommentDraftsPanel'
import { useBotsCommentDraftsPanel } from './use-bots-comment-drafts-panel'

const holder = vi.hoisted(() => ({
  editor: null as Editor | null,
  listUsers: vi.fn(),
  listProjectMembers: vi.fn()
}))

vi.mock('@/runtime/runtime-activecollab-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  activeCollabListUsers: () => holder.listUsers(),
  activeCollabListProjectMembers: (args: { projectId: number }) => holder.listProjectMembers(args)
}))

vi.mock('../ActiveCollabTaskWorkspace', () => ({
  ActiveCollabTaskWorkspace: ({ taskId }: { taskId: number }) => <div>Task pane {taskId}</div>
}))

// happy-dom has no contenteditable, so tests type through the real editor instance.
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

type BotsApi = PreloadApi['bots']

function fakeBots(): {
  [K in keyof BotsApi]: ReturnType<typeof vi.fn>
} {
  return {
    start: vi.fn(),
    status: vi.fn(),
    restart: vi.fn(),
    openLog: vi.fn(),
    onStatusChanged: vi.fn(() => () => {}),
    composioKeyStatus: vi.fn(),
    setComposioKey: vi.fn(),
    listCommentDrafts: vi.fn(async () => ({ ok: true, value: [] })),
    commentDraftTask: vi.fn(),
    updateCommentDraft: vi.fn(),
    discardCommentDraft: vi.fn(),
    undoCommentDraft: vi.fn(),
    commentDraftFeedback: vi.fn(async () => ({ ok: true, value: null })),
    postCommentDraft: vi.fn(async () => ({ ok: true, value: draftFixture({ status: 'posted' }) })),
    reassignCommentDraftTask: vi.fn(async () => ({ ok: true, value: null })),
    addCommentDraftAttachments: vi.fn(async () => ({ ok: true, value: draftFixture() })),
    addCommentDraftImage: vi.fn(async () => ({ ok: true, value: draftFixture() })),
    removeCommentDraftAttachment: vi.fn(async () => ({ ok: true, value: draftFixture() })),
    commentDraftAttachmentPreview: vi.fn(async () => ({
      ok: true,
      value: 'data:image/png;base64,AA=='
    })),
    onCommentDraftsChanged: vi.fn(() => () => {})
  }
}

let bots: ReturnType<typeof fakeBots>

beforeEach(() => {
  bots = fakeBots()
  ;(window as unknown as { api: { bots: unknown; ui: unknown } }).api = {
    bots,
    ui: { onFileDrop: vi.fn(() => () => {}) }
  }
  holder.editor = null
  window.localStorage.clear()
})

afterEach(cleanup)

function renderCard(
  draft: BotsCommentDraft,
  handBackPeople: BotsCommentDraftTask['handBackPeople'] = []
) {
  const view = render(
    <TooltipProvider>
      <BotsCommentDraftCard
        draft={draft}
        task={{
          title: 'Fix the header',
          taskNumber: 12,
          projectName: 'Website',
          handBackPeople
        }}
      />
    </TooltipProvider>
  )
  return {
    ...view,
    rerenderDraft: (next: BotsCommentDraft) =>
      view.rerender(
        <TooltipProvider>
          <BotsCommentDraftCard
            draft={next}
            task={{ title: 'Fix the header', taskNumber: 12, projectName: 'Website' }}
          />
        </TooltipProvider>
      )
  }
}

async function openEditor(): Promise<Editor> {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await waitFor(() => expect(holder.editor).not.toBeNull())
  return holder.editor as Editor
}

function typeAtEnd(editor: Editor, text: string): void {
  act(() => {
    editor.chain().focus('end').insertContent(text).run()
  })
}

describe('BotsCommentDraftsPanel', () => {
  const drafts = [
    draftFixture({ id: 'a', number: 1, botName: 'Bob', taskId: 1 }),
    draftFixture({
      id: 'b',
      number: 2,
      botName: 'Ada',
      taskId: 2,
      version: 2,
      editedBy: 'bot',
      amendNote: 'shorter'
    }),
    draftFixture({ id: 'c', number: 3, taskId: 3, editedBy: 'user', version: 3 })
  ]

  function renderPanel(open: boolean, onOpenChange = vi.fn()) {
    render(
      <TooltipProvider>
        <BotsCommentDraftsPanel
          state={{
            drafts,
            tasks: { 1: { title: 'Fix the header', taskNumber: 12, projectName: 'Website' } },
            error: null
          }}
          open={open}
          overlay={false}
          onOpenChange={onOpenChange}
        />
      </TooltipProvider>
    )
    return onOpenChange
  }

  it('lists drafts oldest first with task, project, bot and who changed them', () => {
    renderPanel(true)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveTextContent('1')
    expect(cards[0]).toHaveTextContent('Fix the header')
    expect(cards[0]).toHaveTextContent('Website · Bob')
    expect(cards[1]).toHaveTextContent('Task #2')
    expect(cards[1]).toHaveTextContent('Amended by Ada · shorter')
    expect(cards[2]).toHaveTextContent('Edited by you')
    expect(screen.getByRole('button', { name: 'Ask Ada to change…' })).toBeInTheDocument()
  })

  it('collapses to a count badge that reopens it', () => {
    const onOpenChange = renderPanel(false)
    expect(screen.queryByRole('article')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '3 comment drafts waiting' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('renders nothing while no draft is waiting', () => {
    const { container } = render(
      <BotsCommentDraftsPanel
        state={{ drafts: [], tasks: {}, error: null }}
        open
        overlay={false}
        onOpenChange={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('stays open on an empty state after the last draft goes, until collapsed', () => {
    const panel = (drafts: BotsCommentDraft[], open: boolean): React.JSX.Element => (
      <BotsCommentDraftsPanel
        state={{ drafts, tasks: {}, error: null }}
        open={open}
        overlay={false}
        onOpenChange={vi.fn()}
      />
    )
    const { container, rerender } = render(panel([draftFixture()], true), {
      wrapper: TooltipProvider
    })
    rerender(panel([], true))
    expect(screen.getByRole('status')).toHaveTextContent('All caught up')
    expect(screen.getByRole('complementary', { name: 'Comment drafts' })).toBeInTheDocument()

    rerender(panel([], false))
    expect(container).toBeEmptyDOMElement()
    rerender(panel([], true))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('useBotsCommentDraftsPanel', () => {
  it('opens when the first draft arrives and remembers a collapse', () => {
    const { result, rerender } = renderHook(({ waiting }) => useBotsCommentDraftsPanel(waiting), {
      initialProps: { waiting: null as number | null }
    })
    rerender({ waiting: 0 })
    act(() => result.current.setOpen(false))
    rerender({ waiting: 1 })
    expect(result.current.open).toBe(true)
    act(() => result.current.setOpen(false))
    rerender({ waiting: 2 })
    expect(result.current.open).toBe(false)
    expect(window.localStorage.getItem('muster.bots.commentDraftsPanelOpen')).toBe('0')
  })

  it('keeps a remembered collapse when drafts are already waiting at startup', () => {
    window.localStorage.setItem('muster.bots.commentDraftsPanelOpen', '0')
    const { result, rerender } = renderHook(({ waiting }) => useBotsCommentDraftsPanel(waiting), {
      initialProps: { waiting: null as number | null }
    })
    rerender({ waiting: 4 })
    expect(result.current.open).toBe(false)
  })
})

describe('BotsCommentDraftCard', () => {
  it('posts and shows nothing extra on success', async () => {
    renderCard(draftFixture())
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(bots.postCommentDraft).toHaveBeenCalledWith({ id: 'd1' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('posts and hands the task back from the Post menu', async () => {
    renderCard(draftFixture(), [{ userId: 5, name: 'Sarah', role: 'delegator' }])
    const trigger = screen.getByRole('button', { name: 'More post options' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Post & reassign to Sarah' }))
    await waitFor(() =>
      expect(bots.postCommentDraft).toHaveBeenCalledWith({ id: 'd1', reassignTo: 5 })
    )
  })

  it('offers the person @mentioned in the draft ahead of the task creator', async () => {
    renderCard(
      draftFixture({
        projectId: 31,
        bodyHtml:
          '<p>Hey <span class="new_mention" data-user-id="9" data-type="user">Felicity Lemke</span></p>'
      }),
      [{ userId: 5, name: 'Efront Feedback', role: 'creator' }]
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More post options' }), {
      button: 0,
      ctrlKey: false
    })
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    expect(items.slice(0, 3)).toEqual([
      'Post',
      'Post & reassign to Felicity Lemke',
      'Post & reassign to Efront Feedback'
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Post & reassign to Felicity Lemke' }))
    await waitFor(() =>
      expect(bots.postCommentDraft).toHaveBeenCalledWith({ id: 'd1', reassignTo: 9 })
    )
    expect(JSON.parse(localStorage.getItem('muster.bots.reassign.31') ?? 'null')).toEqual({
      userId: 9,
      name: 'Felicity Lemke'
    })
  })

  it('keeps the card and shows why when ActiveCollab refuses the post', async () => {
    bots.postCommentDraft.mockResolvedValueOnce({
      ok: false,
      reason: 'post-failed',
      failure: { ok: false, kind: 'network', error: 'offline', status: null }
    })
    renderCard(draftFixture())
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not posted. Could not reach ActiveCollab.'
    )
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('sends a one-line change request to the drafting bot', async () => {
    renderCard(draftFixture())
    fireEvent.click(screen.getByRole('button', { name: 'Ask Bob to change…' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'What should Bob change?' }), {
      target: { value: 'make it shorter' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(bots.commentDraftFeedback).toHaveBeenCalledWith({ id: 'd1', note: 'make it shorter' })
    )
    expect(await screen.findByText('Sent to Bob')).toBeInTheDocument()
  })

  it('offers undo only after an amend that kept the previous body', () => {
    const { rerenderDraft } = renderCard(draftFixture())
    expect(screen.queryByRole('button', { name: 'Undo last change' })).toBeNull()
    rerenderDraft(draftFixture({ canUndo: true, version: 2 }))
    expect(screen.getByRole('button', { name: 'Undo last change' })).toBeInTheDocument()
  })
})

describe('BotsCommentDraftEditor', () => {
  it('loads mentions as chips and closes an untouched save without writing', async () => {
    renderCard(
      draftFixture({
        bodyHtml:
          '<p>Hi <span class="new_mention" data-user-id="12" data-type="user">Ada Lovelace</span></p>'
      })
    )
    const editor = await openEditor()
    const mentions: unknown[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === ACTIVECOLLAB_MENTION_NODE_NAME) {
        mentions.push(node.attrs)
      }
    })
    expect(mentions).toEqual([{ userId: 12, name: 'Ada Lovelace' }])
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    expect(bots.updateCommentDraft).not.toHaveBeenCalled()
  })

  it('keeps the typed text on a conflict and re-sends it on Keep mine', async () => {
    const amended = draftFixture({ version: 3, bodyHtml: '<p>Bob rewrote it</p>' })
    bots.updateCommentDraft
      .mockResolvedValueOnce({ ok: false, reason: 'conflict', message: 'stale', draft: amended })
      .mockResolvedValueOnce({ ok: true, value: draftFixture({ version: 4, editedBy: 'user' }) })
    renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' and more')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Bob updated this draft')).toBeInTheDocument()
    expect(editor.getText()).toContain('Hi and more')
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
    await waitFor(() => expect(bots.updateCommentDraft).toHaveBeenCalledTimes(2))
    expect(bots.updateCommentDraft.mock.calls[1][0]).toMatchObject({
      id: 'd1',
      baseVersion: 3,
      bodyHtml: '<p>Hi and more</p>'
    })
  })

  it("swaps in the bot's text when a newer version arrives and Use Bob's is picked", async () => {
    const { rerenderDraft } = renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' typed')
    rerenderDraft(draftFixture({ version: 2, bodyHtml: '<p>Newer from Bob</p>' }))
    expect(screen.getByText('Bob updated this draft')).toBeInTheDocument()
    expect(editor.getText()).toContain('Hi typed')

    fireEvent.click(screen.getByRole('button', { name: "Use Bob's" }))
    expect(editor.getText()).toBe('Newer from Bob')
    expect(screen.queryByText('Bob updated this draft')).toBeNull()
  })

  it('shows the files and counts them on Post, and removes one from the editor', async () => {
    const files = [
      { id: 'a1', name: 'shot.png', size: 2048, mime: 'image/png', addedBy: 'bot' as const },
      { id: 'a2', name: 'notes.pdf', size: 10, mime: 'application/pdf', addedBy: 'user' as const }
    ]
    renderCard(draftFixture({ attachments: files }))
    expect(screen.getByRole('button', { name: 'Post (2 files)' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'View shot.png' })).toBeTruthy()
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.pdf' }))
    await waitFor(() =>
      expect(bots.removeCommentDraftAttachment).toHaveBeenCalledWith({
        id: 'd1',
        attachmentId: 'a2'
      })
    )
  })

  it('posts edited text from the editor by saving it first', async () => {
    renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' there')
    fireEvent.click(screen.getByRole('button', { name: 'Post to ActiveCollab' }))
    await waitFor(() => expect(bots.postCommentDraft).toHaveBeenCalledTimes(1))
    expect(bots.postCommentDraft.mock.calls[0][0]).toEqual({
      id: 'd1',
      edit: { bodyHtml: '<p>Hi there</p>', bodyText: 'Hi there', baseVersion: 1 }
    })
  })
})

describe('BotsDraftDialog views', () => {
  it('opens the task view from Open task without leaving the Bots view', () => {
    renderCard(draftFixture({ taskId: 42 }))
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }))
    expect(screen.getByRole('tab', { name: 'Task' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Task pane 42')).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent('Fix the header')
  })

  it('keeps typed text when flipping to the task and back', async () => {
    renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' kept')
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: '2',
      metaKey: navigator.userAgent.includes('Mac'),
      ctrlKey: !navigator.userAgent.includes('Mac')
    })
    expect(screen.getByRole('tab', { name: 'Task' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Comment' }))
    expect(screen.getByRole('tab', { name: 'Comment' })).toHaveAttribute('aria-selected', 'true')
    expect(holder.editor?.getText()).toContain('Hi kept')
  })
})

describe('BotsCommentDraftEditor mentions', () => {
  const MEMBER = { id: 12, name: 'Ada Lovelace', avatarUrl: null }
  const OUTSIDER = { id: 7, name: 'Grace Hopper', avatarUrl: null }

  beforeEach(() => {
    holder.listUsers.mockReset().mockResolvedValue({ ok: true, value: [MEMBER, OUTSIDER] })
    holder.listProjectMembers.mockReset().mockResolvedValue({ ok: true, value: [MEMBER] })
  })

  const options = (): string[] =>
    screen.queryAllByRole('option').map((option) => option.textContent ?? '')

  it('suggests project members and never widens to the rest of the instance', async () => {
    renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' @')
    await waitFor(() => expect(options().join()).toContain('Ada Lovelace'))
    typeAtEnd(editor, 'Gra')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(options()).toEqual([])
    expect(holder.listUsers).not.toHaveBeenCalled()
  })

  it('offers nobody rather than the whole instance when members cannot be read', async () => {
    holder.listProjectMembers.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'members unavailable',
      status: 500
    })
    // A project the earlier test has not cached members for.
    renderCard(draftFixture({ projectId: 99 }))
    const editor = await openEditor()
    typeAtEnd(editor, ' @')
    await waitFor(() => expect(holder.listProjectMembers).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(holder.listUsers).not.toHaveBeenCalled()
    expect(options()).toEqual([])
  })
})
