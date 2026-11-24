import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import {
  buildPageOutline,
  collectPageOutlineHeadings,
  pageOutlineActiveIndex,
  showsPageOutline
} from './project-page-outline-model'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'

const rows = (headings: { level: number; text: string }[]) =>
  buildPageOutline(headings).map(({ title, level, depth }) => ({ title, level, depth }))

describe('page outline items', () => {
  it('nests by heading level and indents skipped levels one step', () => {
    expect(
      rows([
        { level: 1, text: 'Intro' },
        { level: 3, text: 'Skipped to three' },
        { level: 2, text: 'Setup' },
        { level: 4, text: 'Skipped to four' },
        { level: 2, text: 'Usage' },
        { level: 6, text: 'Too deep' }
      ])
    ).toEqual([
      { title: 'Intro', level: 1, depth: 0 },
      { title: 'Skipped to three', level: 3, depth: 1 },
      { title: 'Setup', level: 2, depth: 1 },
      { title: 'Skipped to four', level: 4, depth: 2 },
      { title: 'Usage', level: 2, depth: 1 }
    ])
  })

  it('starts at depth zero when a page opens below h1', () => {
    expect(
      rows([
        { level: 3, text: 'Notes' },
        { level: 2, text: 'Plan' },
        { level: 3, text: 'Step' }
      ]).map((row) => row.depth)
    ).toEqual([0, 0, 1])
  })

  it('keeps heading text literal and ids unique', () => {
    const items = buildPageOutline([
      { level: 2, text: 'Use `*args*` & [links](x) #1' },
      { level: 2, text: 'Repeat' },
      { level: 2, text: 'Repeat' }
    ])
    expect(items.map((item) => item.title)).toEqual([
      'Use `*args*` & [links](x) #1',
      'Repeat',
      'Repeat'
    ])
    expect(new Set(items.map((item) => item.id)).size).toBe(3)
  })

  it('reads headings from the page editor', () => {
    const codec = createRichMarkdownEditorCodec()
    const editor = new Editor({
      element: null,
      extensions: createProjectPagesExtensions(codec, '', 's'),
      content: encodeRawMarkdownHtmlForRichEditor(
        '# Title\n\nBody\n\n## Has **bold** text\n\n- item\n\n### Last',
        codec
      ),
      contentType: 'markdown'
    })
    try {
      expect(collectPageOutlineHeadings(editor.state.doc)).toEqual([
        { level: 1, text: 'Title' },
        { level: 2, text: 'Has bold text' },
        { level: 3, text: 'Last' }
      ])
    } finally {
      editor.destroy()
    }
  })
})

describe('page outline threshold', () => {
  it('shows from two headings', () => {
    expect(showsPageOutline(buildPageOutline([]))).toBe(false)
    expect(showsPageOutline(buildPageOutline([{ level: 2, text: 'Only' }]))).toBe(false)
    expect(
      showsPageOutline(
        buildPageOutline([
          { level: 2, text: 'Only' },
          { level: 3, text: '   ' }
        ])
      )
    ).toBe(false)
    expect(
      showsPageOutline(
        buildPageOutline([
          { level: 2, text: 'One' },
          { level: 3, text: 'Two' }
        ])
      )
    ).toBe(true)
  })
})

describe('page outline scroll spy', () => {
  const page = { tops: [100, 600, 1200], viewportHeight: 500, scrollHeight: 2000 }

  it('picks the last heading above the reading line', () => {
    expect(pageOutlineActiveIndex({ ...page, scrollTop: 560 })).toBe(1)
    expect(pageOutlineActiveIndex({ ...page, scrollTop: 1100 })).toBe(1)
    expect(pageOutlineActiveIndex({ ...page, scrollTop: 1160 })).toBe(2)
  })

  it('marks the first heading while it is on screen at the top', () => {
    expect(pageOutlineActiveIndex({ ...page, scrollTop: 0 })).toBe(0)
    expect(pageOutlineActiveIndex({ ...page, tops: [700, 900], scrollTop: 0 })).toBe(-1)
  })

  it('marks the last visible heading once scrolled to the end', () => {
    expect(
      pageOutlineActiveIndex({
        tops: [100, 1700, 1800],
        viewportHeight: 500,
        scrollHeight: 2000,
        scrollTop: 1500
      })
    ).toBe(2)
  })

  it('ignores headings it could not place', () => {
    expect(
      pageOutlineActiveIndex({ ...page, tops: [100, Number.POSITIVE_INFINITY], scrollTop: 900 })
    ).toBe(0)
  })
})
