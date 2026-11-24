// The editor's extension set for pages: the file editor's markdown blocks with a pages placeholder.
import Placeholder from '@tiptap/extension-placeholder'
import type { AnyExtension } from '@tiptap/core'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import type { RichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'

// Link drops hrefs with unknown schemes, which would strip page links on load.
const PAGE_LINK_PROTOCOL = 'muster-page'

export function createProjectPagesExtensions(
  codec: RichMarkdownEditorCodec,
  placeholder: string
): AnyExtension[] {
  const base = createRichMarkdownExtensions({ codec }).map((extension) =>
    extension.name === 'link'
      ? extension.configure({ ...extension.options, protocols: [PAGE_LINK_PROTOCOL] })
      : extension
  )
  return [...base, Placeholder.configure({ placeholder })]
}
