// Comment HTML from outside the editor (a bot's draft), rebuilt through the editor's schema so only
// the tags, links and mentions the composer can emit are ever posted.
import { getSchema } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'
import { activeCollabCommentHtmlForEditor } from './activecollab-comment-mention-document'

let parser: ProseMirrorDOMParser | null = null

export function canonicalActiveCollabCommentHtml(html: string): string {
  parser ??= ProseMirrorDOMParser.fromSchema(getSchema(createActiveCollabCommentExtensions('')))
  const dom = new DOMParser().parseFromString(
    `<body>${activeCollabCommentHtmlForEditor(html)}</body>`,
    'text/html'
  )
  return activeCollabCommentBodyHtml(parser.parse(dom.body))
}
