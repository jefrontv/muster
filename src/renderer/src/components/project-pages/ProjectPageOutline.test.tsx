// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { buildPageOutline } from './project-page-outline-model'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'
import { ProjectPageOutlineRail } from './ProjectPageOutlineRail'
import { usePageOutline } from './use-page-outline'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

function mount(element: React.ReactNode): HTMLElement {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(element))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const items = buildPageOutline([
  { level: 1, text: 'Intro' },
  { level: 2, text: 'Setup' },
  { level: 3, text: 'Details' }
])

function key(target: Element, name: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  })
}

describe('ProjectPageOutlineRail', () => {
  it('draws a dash per heading and marks the section in view', () => {
    const view = mount(<ProjectPageOutlineRail items={items} activeIndex={1} onJump={vi.fn()} />)
    const dashes = view.querySelectorAll('button[aria-label="Page outline"] span')
    expect(dashes).toHaveLength(3)
    expect(dashes[1].getAttribute('data-current')).toBe('true')
    expect(view.querySelector('nav')).toBeNull()
  })

  it('opens on focus and moves through headings with the keyboard', () => {
    const onJump = vi.fn()
    const view = mount(<ProjectPageOutlineRail items={items} activeIndex={1} onJump={onJump} />)
    const rail = view.querySelector<HTMLButtonElement>('button[aria-label="Page outline"]')!
    act(() => rail.focus())
    expect(rail.getAttribute('aria-expanded')).toBe('true')
    const rows = view.querySelectorAll<HTMLButtonElement>('nav [data-outline-row]')
    expect(Array.from(rows, (row) => row.textContent)).toEqual(['Intro', 'Setup', 'Details'])

    key(rail, 'ArrowDown')
    expect(document.activeElement).toBe(rows[1])
    key(rows[1], 'ArrowDown')
    expect(document.activeElement).toBe(rows[2])
    key(rows[2], 'ArrowUp')
    key(rows[1], 'ArrowUp')
    expect(document.activeElement).toBe(rows[0])
    key(rows[0], 'Enter')
    expect(onJump).toHaveBeenCalledWith(0)

    act(() => rows[2].click())
    expect(onJump).toHaveBeenLastCalledWith(2)
  })
})

function OutlineProbe({
  editor,
  onReady
}: {
  editor: Editor
  onReady: (outline: ReturnType<typeof usePageOutline>) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const outline = usePageOutline(() => editor, scrollRef)
  onReady(outline)
  return <div ref={scrollRef} />
}

const nextFrame = (): Promise<void> =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

describe('usePageOutline', () => {
  it('follows edits and puts the caret on the heading it jumps to', async () => {
    const codec = createRichMarkdownEditorCodec()
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: createProjectPagesExtensions(codec, '', 's'),
      content: encodeRawMarkdownHtmlForRichEditor('# One\n\nText\n\n## Two', codec),
      contentType: 'markdown'
    })
    let outline: ReturnType<typeof usePageOutline> | null = null
    mount(<OutlineProbe editor={editor} onReady={(value) => (outline = value)} />)
    await nextFrame()
    await nextFrame()
    expect(outline!.items.map((item) => item.title)).toEqual(['One', 'Two'])

    // An agent's write replaces the content without an update event.
    act(() => {
      editor.commands.setContent(
        encodeRawMarkdownHtmlForRichEditor('# One\n\n## Two\n\n## Three', codec),
        { contentType: 'markdown', emitUpdate: false }
      )
    })
    await nextFrame()
    expect(outline!.items.map((item) => item.title)).toEqual(['One', 'Two', 'Three'])

    act(() => outline!.jumpTo(2))
    const { $from } = editor.state.selection
    expect($from.parent.type.name).toBe('heading')
    expect($from.parent.textContent).toBe('Three')
    expect($from.parentOffset).toBe(0)
    editor.destroy()
    element.remove()
  })
})
