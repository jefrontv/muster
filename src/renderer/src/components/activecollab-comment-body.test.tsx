// @vitest-environment happy-dom
//
// The fixture is the REAL body of ActiveCollab comment 314406 on task 509055, byte for byte,
// including the U+00A0 the provider writes as its blank-line separator and the `object-id` it
// states on the embedded screenshot.
//
// The body renders against the real store slice with only the runtime client mocked, so "the grid
// and the inline image share one authenticated read" is proved end to end rather than against a
// stub action.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

import type { AppState } from '@/store/types'
import { createActiveCollabSlice } from '@/store/slices/activecollab'
import { clearActiveCollabAttachmentImageFetches } from '@/store/slices/activecollab-attachment-images'
import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabAttachment } from '../../../shared/activecollab-types'

type ImageResult = ActiveCollabResult<ActiveCollabAttachmentImage>

const holder = vi.hoisted(() => ({
  state: null as unknown,
  getAttachmentImage: vi.fn<(args: { attachmentId: number }) => Promise<ImageResult>>()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(holder.state)
}))

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabStatus: vi.fn(),
  activeCollabConnect: vi.fn(),
  activeCollabDisconnect: vi.fn(),
  activeCollabListAssignedTasks: vi.fn(),
  activeCollabListProjects: vi.fn(),
  activeCollabGetTaskDetail: vi.fn(),
  activeCollabGetAttachmentImage: (args: { attachmentId: number }) =>
    holder.getAttachmentImage(args),
  activeCollabUpdateTask: vi.fn(),
  activeCollabCompleteTask: vi.fn(),
  activeCollabReopenTask: vi.fn(),
  activeCollabPostComment: vi.fn(),
  activeCollabListLabels: vi.fn(),
  activeCollabListUsers: vi.fn(),
  activeCollabListProjectMembers: vi.fn(),
  activeCollabDownloadAttachment: vi.fn()
}))

import CommentMarkdown from './sidebar/CommentMarkdown'
import { ActiveCollabAttachmentGrid } from './activecollab-attachment-grid'

const INSTANCE = 'https://projects.efront.com.au'
const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
const ATTACHMENT_ID = 249016

const IMAGE_SRC =
  '/proxy.php?proxy=forward_thumbnail&module=system' +
  '&invalidate=c31ec105f4a7b7bb02b123e357a48f1666397ad5&context=upload' +
  '&name=2026-07%2F169017-gNyanDFNHUMBQFQqtqWxUyGnBcDc1OsicTLFpUyX' +
  '&original_file_name=unnamed.png&width=800&height=800&ver=6638&scale=scale' +
  '&i=--THUMBNAIL-TOKEN--&crop=1'

const REAL_COMMENT_BODY = [
  '<p>Thanks <span class="mention mention-user">Jake Varrese</span> !</p>',
  '<p>\u00a0</p>',
  '<p>Hoping you can help with a small tweak from the client:</p>',
  '<p>\u00a0</p>',
  '<ul>',
  '<li class="m_1191305752919776827MsoListParagraph">Buying cycle – can we please have ‘First' +
    ` Home Buyer’ on one line like the others?<br><img src="${IMAGE_SRC}" alt="unnamed.png"` +
    ' image-type="attachment" object-id="249016">',
  '<ul>',
  '<li class="m_1191305752919776827MsoListParagraph">Not sure what\'s the best approach here,' +
    ' maybe we put these in two columns? Or increase the width of the form overall?</li>',
  '</ul>',
  '</li>',
  '</ul>'
].join('\n')

const INLINE_ATTACHMENT: ActiveCollabAttachment = {
  id: ATTACHMENT_ID,
  name: 'unnamed.png',
  mimeType: 'image/png',
  size: 41231,
  isImage: true
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The slice's in-flight map outlives any one store, so isolate it like the DOM container.
  clearActiveCollabAttachmentImageFetches()
  holder.getAttachmentImage.mockReset()
  holder.getAttachmentImage.mockResolvedValue({
    ok: true,
    value: { dataUrl: DATA_URL, mimeType: 'image/png' }
  })
  const store = create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a)
      }) as AppState
  )
  holder.state = store.getState()
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

async function mountBody(content: string): Promise<void> {
  await act(async () => {
    root.render(<CommentMarkdown content={content} activeCollabHtml={{ instanceUrl: INSTANCE }} />)
  })
}

/** The real comment surface: the body, then the grid listing the same attachment underneath. */
async function mountBodyWithGrid(content: string): Promise<void> {
  await act(async () => {
    root.render(
      <>
        <CommentMarkdown content={content} activeCollabHtml={{ instanceUrl: INSTANCE }} />
        <ActiveCollabAttachmentGrid attachments={[INLINE_ATTACHMENT]} />
      </>
    )
  })
}

function paragraphs(): HTMLParagraphElement[] {
  return [...container.querySelectorAll('p')]
}

describe('ActiveCollab comment body rendering', () => {
  it('uses the provider blank-line separator the fixture actually ships', () => {
    // Guards the fixture: a plain space here would silently retire the case under test.
    expect(REAL_COMMENT_BODY).toContain('<p>\u00a0</p>')
  })

  it("keeps the author's blank line as its own paragraph instead of running the text together", async () => {
    await mountBody(REAL_COMMENT_BODY)

    const rendered = paragraphs()
    expect(rendered).toHaveLength(4)
    expect(rendered[0].textContent).toBe('Thanks Jake Varrese !')
    expect(rendered[1].textContent).toBe('\u00a0')
    expect(rendered[2].textContent).toBe('Hoping you can help with a small tweak from the client:')
    expect(rendered[3].textContent).toBe('\u00a0')
    // The defect: the compact variant emitted inline spans, so every paragraph shared one line box.
    expect(container.querySelectorAll('span.comment-md-p')).toHaveLength(0)
  })

  it('does not over-space ordinary consecutive paragraphs', async () => {
    await mountBody('<p>First paragraph.</p>\n<p>Second paragraph.</p>')

    const ordinary = paragraphs()
    expect(ordinary.map((node) => node.textContent)).toEqual([
      'First paragraph.',
      'Second paragraph.'
    ])
    // No blank paragraph is invented, and the class is the same one the blank-line body uses, so
    // the extra space there comes from the author's own paragraph rather than a fattened margin.
    const ordinaryClass = ordinary[0].className
    await mountBody(REAL_COMMENT_BODY)
    expect(paragraphs().every((node) => node.className === ordinaryClass)).toBe(true)
  })

  it('fills a blank paragraph written with a plain space, which draws no line box on its own', async () => {
    await mountBody('<p>Above</p>\n<p> </p>\n<p>Below</p>')

    expect(paragraphs().map((node) => node.textContent)).toEqual(['Above', '\u00a0', 'Below'])
  })

  it('keeps the nested bullet and the line break inside the list item', async () => {
    await mountBody(REAL_COMMENT_BODY)

    const lists = container.querySelectorAll('ul')
    expect(lists).toHaveLength(2)
    const outerItem = lists[0].querySelector('li')
    expect(outerItem?.querySelector('br')).not.toBeNull()
    expect(outerItem?.textContent).toContain('‘First Home Buyer’')
    const nestedItem = outerItem?.querySelector('ul > li')
    expect(nestedItem?.textContent).toContain('maybe we put these in two columns?')
  })

  it('renders the attachment image inline, after the break, inside the bullet that owns it', async () => {
    await mountBody(REAL_COMMENT_BODY)

    const image = container.querySelector('li img')
    expect(image?.getAttribute('src')).toBe(DATA_URL)
    expect(image?.getAttribute('alt')).toBe('unnamed.png')
    expect(holder.getAttachmentImage).toHaveBeenCalledWith({ attachmentId: ATTACHMENT_ID })

    const outerItem = container.querySelector('li')
    const lineBreak = outerItem?.querySelector('br')
    expect(outerItem?.contains(image ?? null)).toBe(true)
    // Following, not preceding: the author put the screenshot under that sentence.
    expect(lineBreak?.compareDocumentPosition(image as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('constrains the inline image to the content width rather than the 800px the URL requests', async () => {
    await mountBody(REAL_COMMENT_BODY)

    const image = container.querySelector('li img')
    expect(image?.className).toContain('max-w-full')
    expect(image?.getAttribute('width')).toBeNull()
  })

  it('serves the inline image and the grid thumbnail from a single authenticated read', async () => {
    await mountBodyWithGrid(REAL_COMMENT_BODY)

    const resolved = [...container.querySelectorAll('img')].filter(
      (node) => node.getAttribute('src') === DATA_URL
    )
    // One in the prose, one in the grid below — both painted, one transfer.
    expect(resolved).toHaveLength(2)
    expect(holder.getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('keeps the inlined attachment listed in the grid, so the attachment list stays complete', async () => {
    await mountBodyWithGrid(REAL_COMMENT_BODY)

    expect(
      container.querySelector(`button[aria-label="Open ${INLINE_ATTACHMENT.name}"] img`)
    ).not.toBeNull()
  })

  it('opens the existing lightbox when the inline image is clicked', async () => {
    await mountBody(REAL_COMMENT_BODY)

    const trigger = container.querySelector<HTMLButtonElement>('li button')
    expect(trigger?.getAttribute('aria-label')).toBe('Open unnamed.png')
    await act(async () => {
      trigger?.click()
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('unnamed.png')
    expect(dialog?.querySelector('img')?.getAttribute('src')).toBe(DATA_URL)
  })

  it('reports a failed inline image without collapsing the sentence around it', async () => {
    holder.getAttachmentImage.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'attachment is gone',
      status: 404
    })

    await mountBody(REAL_COMMENT_BODY)

    const outerItem = container.querySelector('li')
    expect(outerItem?.textContent).toContain('‘First Home Buyer’')
    expect(outerItem?.querySelector('[role="alert"]')?.textContent).toContain('attachment is gone')
    expect(container.querySelector('li img')).toBeNull()
  })

  it('still suppresses an instance image that states no attachment id', async () => {
    await mountBody(
      `<p>Before</p>\n<p><img src="${IMAGE_SRC}" alt="unnamed.png"></p>\n<p>After</p>`
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('Before')
    expect(container.textContent).toContain('After')
    expect(holder.getAttachmentImage).not.toHaveBeenCalled()
  })

  it('refuses an ac-image the provider body minted itself', async () => {
    await mountBody('<p>Body <ac-image>249016 stolen.png</ac-image> text</p>')

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('249016 stolen.png')
    expect(holder.getAttachmentImage).not.toHaveBeenCalled()
  })

  it('strips scripts, event handlers and javascript: urls while inlining an attachment', async () => {
    await mountBody(
      '<p>Hi<script>window.stolen = 1</script></p>\n' +
        '<p><a href="javascript:alert(1)">tap</a></p>\n' +
        `<p><img src="${IMAGE_SRC}" alt="x" onerror="window.stolen = 2"` +
        ' image-type="attachment" object-id="249016"></p>'
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('window.stolen')
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:')
    // The attachment still inlines; the retag rebuilt the node, so the handler never survived.
    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe(DATA_URL)
    expect(image?.getAttribute('onerror')).toBeNull()
  })
})
