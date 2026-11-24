// The editor's extension set for pages: the file editor's markdown blocks with a pages placeholder.
import Placeholder from '@tiptap/extension-placeholder'
import type { AnyExtension } from '@tiptap/core'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import type { RichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'

export function createProjectPagesExtensions(
  codec: RichMarkdownEditorCodec,
  placeholder: string
): AnyExtension[] {
  return [...createRichMarkdownExtensions({ codec }), Placeholder.configure({ placeholder })]
}
