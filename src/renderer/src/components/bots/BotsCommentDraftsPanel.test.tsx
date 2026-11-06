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
import type { Editor } from '@tiptap/react'
import type * as TiptapReact from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { draftFixture } from '../../../../shared/bots-comment-draft-fixture'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import type { PreloadApi } from '../../../../preload/api-types'
import { ACTIVECOLLAB_MENTION_NODE_NAME } from '../activecollab-comment-mention-node'
import { BotsCommentDraftCard } from './BotsCommentDraftCard'
import { BotsCommentDraftsPanel } from './BotsCommentDraftsPanel'
import { useBotsCommentDraftsPanel } from './use-bots-comment-drafts-panel'

const holder = vi.hoisted(() => ({ editor: null as Editor | null }))

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
    onCommentDraftsChanged: vi.fn(() => () => {})
  }
}

let bots: ReturnType<typeof fakeBots>

beforeEach(() => {
  bots = fakeBots()
  ;(window as unknown as { api: { bots: unknown } }).api = { bots }
  holder.editor = null
  window.localStorage.clear()
})

afterEach(cleanup)

function renderCard(draft: BotsCommentDraft) {
  const view = render(
    <TooltipProvider>
      <BotsCommentDraftCard
        draft={draft}
        task={{ title: 'Fix the header', taskNumber: 12, projectName: 'Website' }}
        onOpenTask={vi.fn()}
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
            onOpenTask={vi.fn()}
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
          onOpenTask={vi.fn()}
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
        onOpenTask={vi.fn()}
      />
    )
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Bob updated this draft')).toBeInTheDocument()
    expect(editor.getText()).toContain('Hi and more')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

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

  it('posts edited text from the editor by saving it first', async () => {
    renderCard(draftFixture())
    const editor = await openEditor()
    typeAtEnd(editor, ' there')
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(bots.postCommentDraft).toHaveBeenCalledTimes(1))
    expect(bots.postCommentDraft.mock.calls[0][0]).toEqual({
      id: 'd1',
      edit: { bodyHtml: '<p>Hi there</p>', bodyText: 'Hi there', baseVersion: 1 }
    })
  })
})
