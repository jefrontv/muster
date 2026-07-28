// The composer's schema, kept deliberately smaller than TipTap's defaults.
//
// This is the FIRST of the two gates on what can be posted. A comment goes to a shared instance
// other people read, and ActiveCollab renders only a narrow slice of HTML, so the editor should be
// incapable of holding a heading, a list, a table or an image in the first place — a document that
// cannot contain a node is a stronger guarantee than a serialiser that remembers to skip it. The
// second gate is `activeCollabCommentBodyHtml`, which emits by explicit case and drops anything it
// does not recognise.
//
// Pasting a heading is therefore not an error: ProseMirror maps the unschema'd node onto a
// paragraph and keeps the words, which is what an author pasting from a doc actually wants.
//
// Scoped to composing NEW comments. Nothing here ever parses a body the server sent, so narrowing
// the schema cannot drop anything an existing comment holds — notably the inline
// `<img object-id … image-type="attachment">` the read path renders. Adding comment EDITING would
// change that, and the image node would have to be added here deliberately before it could.

import type { AnyExtension } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

import { ActiveCollabMentionNode } from './activecollab-comment-mention-node'

/**
 * Everything StarterKit ships that this composer must not be able to produce.
 *
 * Listed as an exhaustive object rather than a spread so adding a formatting affordance is a
 * deliberate edit here, next to the serialiser's allowlist, instead of an accident of a dependency
 * bump. `link` is off only to be re-added configured below.
 */
const DISABLED_STARTER_KIT_NODES = {
  blockquote: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  link: false,
  listItem: false,
  listKeymap: false,
  orderedList: false,
  strike: false,
  // Why: an auto-appended trailing paragraph is a document the author did not write; the serialiser
  // would drop it, but the empty-draft check reads the document, not the output.
  trailingNode: false,
  underline: false
} as const

/**
 * The extensions the comment composer runs on: paragraphs, hard breaks, bold, italic, links, and
 * the mention node — plus undo/redo and the cursor affordances, which produce no markup at all.
 */
export function createActiveCollabCommentExtensions(placeholder: string): AnyExtension[] {
  return [
    StarterKit.configure(DISABLED_STARTER_KIT_NODES),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      // Why: the serialiser re-checks every href anyway, but keeping the mark itself clean means a
      // hostile paste never becomes a clickable `javascript:` link inside the author's own editor.
      protocols: ['http', 'https', 'mailto']
    }),
    ActiveCollabMentionNode,
    Placeholder.configure({ placeholder })
  ]
}
