// Puts stored markdown into the open editor without firing autosave, keeping the cursor nearby.
import type { Editor } from '@tiptap/react'
import { encodeRawMarkdownHtmlForRichEditor } from '../editor/raw-markdown-html'
import type { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'

type Codec = ReturnType<typeof createRichMarkdownEditorCodec>

export function replaceEditorMarkdown(editor: Editor, markdown: string, codec: Codec): void {
  const { from, to } = editor.state.selection
  editor.commands.setContent(encodeRawMarkdownHtmlForRichEditor(markdown, codec), {
    contentType: 'markdown',
    emitUpdate: false
  })
  const size = editor.state.doc.content.size
  if (editor.isFocused) {
    editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) })
  }
}
