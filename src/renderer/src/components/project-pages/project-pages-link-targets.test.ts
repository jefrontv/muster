// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'
import { clickedPageId, syncPageLinkTargets } from './project-pages-link-targets'

const page = (id: string, title: string, archivedAt: number | null = null): ProjectPageMeta =>
  ({ id, title, parentId: null, archivedAt }) as ProjectPageMeta

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

function open(markdown: string): Editor {
  const codec = createRichMarkdownEditorCodec()
  editor = new Editor({
    element: document.createElement('div'),
    extensions: createProjectPagesExtensions(codec, '', 's'),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
    contentType: 'markdown'
  })
  return editor
}

const docLink = (current: Editor): HTMLElement =>
  current.view.dom.querySelector<HTMLElement>('[data-doc-link-target]')!

describe('page link targets in the open editor', () => {
  it('resolves a [[link]] once its page is created, and drops it when archived', () => {
    const current = open('See [[Later]] soon.')
    syncPageLinkTargets(current, [page('a', 'Other')])
    expect(docLink(current).dataset.pageLink).toBe('missing')
    expect(docLink(current).className).toContain('rich-markdown-doc-link--missing')
    expect(clickedPageId(docLink(current), [page('a', 'Other')])).toBeNull()

    const created = [page('a', 'Other'), page('b', 'Later')]
    syncPageLinkTargets(current, created)
    expect(docLink(current).dataset.pageLink).toBe('resolved')
    expect(docLink(current).className).not.toContain('--missing')
    expect(clickedPageId(docLink(current), created)).toBe('b')

    syncPageLinkTargets(current, [page('a', 'Other'), page('b', 'Later', 1)])
    expect(docLink(current).dataset.pageLink).toBe('missing')
    // The markdown keeps the [[link]], so it resolves again if the page comes back.
    expect(current.getMarkdown()).toContain('[[Later]]')
  })

  it('marks a page link whose page is in the Trash', () => {
    const current = open('See [Later](muster-page://b).')
    syncPageLinkTargets(current, [page('b', 'Later')])
    expect(current.view.dom.querySelector('.page-link-missing')).toBeNull()
    syncPageLinkTargets(current, [page('b', 'Later', 1)])
    expect(current.view.dom.querySelector('.page-link-missing')?.textContent).toBe('Later')
  })
})
