// The round's plan text as the page editor would save it, so a diff shows only real edits.
import { Editor } from '@tiptap/core'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { createProjectPagesExtensions } from '../project-pages/project-pages-editor-extensions'

export function serializePageMarkdown(markdown: string, scopeKey: string): string {
  const codec = createRichMarkdownEditorCodec()
  let editor: Editor | null = null
  try {
    editor = new Editor({
      extensions: createProjectPagesExtensions(codec, '', scopeKey),
      content: encodeRawMarkdownHtmlForRichEditor(markdown, codec),
      contentType: 'markdown'
    })
    return editor.getMarkdown()
  } catch {
    return markdown
  } finally {
    editor?.destroy()
  }
}
