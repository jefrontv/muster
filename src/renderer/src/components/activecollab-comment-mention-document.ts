// The `@token` the caret sits in, and swapping it for a mention node — the ProseMirror half of
// mentions, kept apart from the text-and-people half so that one stays editor-free.

import type { Editor } from '@tiptap/react'

import type { ActiveCollabUser } from '../../../shared/activecollab-types'
import { ACTIVECOLLAB_MENTION_NODE_NAME } from './activecollab-comment-mention-node'
import { activeCollabMentionToken } from './activecollab-comment-mentions'

/**
 * U+FFFC OBJECT REPLACEMENT CHARACTER, one per inline leaf.
 *
 * Load-bearing, and the reason a mention chip cannot confuse the scanner: an inline leaf occupies
 * exactly one document position, so rendering it as exactly one character keeps string offsets and
 * document positions in step and lets `at` be added straight to the block start. Rendering the
 * mention's own text here instead would both break that arithmetic and re-expose the `@Name` the
 * node exists to get rid of.
 */
const INLINE_LEAF_PLACEHOLDER = '\uFFFC'

/** An open `@partial`, addressed as document positions so it can be replaced in place. */
export type ActiveCollabMentionRange = {
  query: string
  /** Position of the `@`. */
  from: number
  /** Position of the caret, i.e. the end of the token. */
  to: number
}

export function sameActiveCollabMentionRange(
  left: ActiveCollabMentionRange | null,
  right: ActiveCollabMentionRange | null
): boolean {
  if (left === null || right === null) {
    return left === right
  }
  return left.query === right.query && left.from === right.from && left.to === right.to
}

/**
 * The `@partial` under the caret, or null when the menu should be shut.
 *
 * Only ever scans the current text block: an `@` a paragraph ago is not the one being typed, and
 * bounding the scan there is also what keeps a long comment from re-reading itself on every
 * keystroke. A non-empty selection is a range, not a caret, so it opens nothing.
 */
export function activeCollabEditorMentionToken(editor: Editor): ActiveCollabMentionRange | null {
  const { selection } = editor.state
  if (!selection.empty || !selection.$from.parent.isTextblock) {
    return null
  }
  const blockStart = selection.$from.start()
  const before = editor.state.doc.textBetween(
    blockStart,
    selection.$from.pos,
    '\n',
    INLINE_LEAF_PLACEHOLDER
  )
  const token = activeCollabMentionToken(before, before.length)
  if (token === null) {
    return null
  }
  return { query: token.query, from: blockStart + token.at, to: selection.$from.pos }
}

/**
 * Replace the token with a mention node, leaving everything past the caret untouched.
 *
 * The trailing space is a separator, not decoration: it is skipped when the next character is
 * already whitespace, so accepting mid-sentence does not leave a double space behind. At the end of
 * a block there is no next character, and the space is what lets the author keep typing without
 * their next word being welded to the chip.
 */
export function insertActiveCollabMention(
  editor: Editor,
  range: ActiveCollabMentionRange,
  user: ActiveCollabUser
): void {
  const { doc } = editor.state
  const blockEnd = doc.resolve(range.to).end()
  const next =
    range.to < blockEnd ? doc.textBetween(range.to, range.to + 1, '', INLINE_LEAF_PLACEHOLDER) : ''
  const content: Record<string, unknown>[] = [
    { type: ACTIVECOLLAB_MENTION_NODE_NAME, attrs: { userId: user.id, name: user.name } }
  ]
  if (!/^\s/.test(next)) {
    content.push({ type: 'text', text: ' ' })
  }
  editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, content).run()
}
