// Each block in the agent reference survives a load and save in the pages editor unchanged.
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { PAGE_BLOCKS } from '../../../../shared/project-pages-blocks'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { createProjectPagesExtensions } from './project-pages-editor-extensions'

// The editor pads table cells and tags toggles it loaded; neither changes the content.
function normalize(markdown: string): string {
  return markdown.replace(/ +\|/g, ' |').replace('<details class="orca-details">', '<details>')
}

function roundTrip(markdown: string): string {
  const codec = createRichMarkdownEditorCodec()
  const editor = new Editor({
    element: null,
    extensions: createProjectPagesExtensions(codec, '', 's'),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
    contentType: 'markdown'
  })
  try {
    return normalize(editor.getMarkdown().trim())
  } finally {
    editor.destroy()
  }
}

describe('page blocks', () => {
  // Page links are resolved on the server before the editor sees them.
  const saved = PAGE_BLOCKS.filter((example) => example.block !== 'Page link')
  it.each(saved.map((example) => [example.block, example.markdown]))('%s', (_block, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('keeps a resolved page link', () => {
    const link = '[Page title](muster-page://p_1)'
    expect(roundTrip(link)).toBe(link)
  })
})
