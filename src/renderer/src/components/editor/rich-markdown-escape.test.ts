import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'
import { createRichMarkdownEditorCodec } from './rich-markdown-source-transport'

function open(markdown: string): Editor {
  const codec = createRichMarkdownEditorCodec()
  return new Editor({
    element: null,
    extensions: createRichMarkdownExtensions({ codec }),
    content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
    contentType: 'markdown'
  })
}

describe('markdown escapes in the rich editor', () => {
  it.each([
    'a \\[b\\] c',
    '[foo\\_bar](https://x.com)',
    '**a\\*b**',
    '*a\\_b*',
    '~~a\\~b~~',
    '# Head \\# x',
    '- item \\* x',
    '\\[\\[y]] and \\*\\*not bold\\*\\*',
    'see \\& and \\< done'
  ])('round-trips %s', (markdown) => {
    const editor = open(markdown)
    expect(editor.getMarkdown().trim()).toBe(markdown)
    editor.destroy()
  })
})
