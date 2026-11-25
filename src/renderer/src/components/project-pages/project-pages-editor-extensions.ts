// The editor's extension set for pages: the file editor's markdown blocks with page images, tag
// pills, callouts and a placeholder.
import Placeholder from '@tiptap/extension-placeholder'
import type { AnyExtension } from '@tiptap/core'
import { createRichMarkdownExtensions } from '../editor/rich-markdown-extensions'
import type { RichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import { ProjectPageActiveCollab } from './project-pages-activecollab-blocks'
import { ProjectPageCallouts } from './project-pages-callouts'
import { ProjectPageCommentHighlights } from './project-pages-comment-highlights'
import { ProjectPageDiagramEmbeds } from './project-pages-diagram-embeds'
import { withPageImages } from './project-pages-files'
import { ProjectPageLinkTargets } from './project-pages-link-targets'
import { ProjectPageTags } from './project-pages-tag-decorations'

// Link drops hrefs with unknown schemes, which would strip page links on load.
const PAGE_LINK_PROTOCOL = 'muster-page'

export function createProjectPagesExtensions(
  codec: RichMarkdownEditorCodec,
  placeholder: string,
  scopeKey: string
): AnyExtension[] {
  const base = createRichMarkdownExtensions({ codec }).map((extension) =>
    extension.name === 'link'
      ? extension.configure({ ...extension.options, protocols: [PAGE_LINK_PROTOCOL] })
      : extension
  )
  return [
    ...base.map((extension) =>
      extension.name === 'image' ? withPageImages(extension, scopeKey) : extension
    ),
    ProjectPageTags,
    ProjectPageCallouts,
    ProjectPageCommentHighlights,
    ProjectPageActiveCollab,
    ProjectPageDiagramEmbeds.configure({ scopeKey }),
    ProjectPageLinkTargets,
    Placeholder.configure({ placeholder })
  ]
}
