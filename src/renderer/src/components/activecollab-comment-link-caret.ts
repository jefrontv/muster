// Whether the caret is inside a link, as opposed to sitting against the end of one.
//
// `editor.isActive('link')` cannot tell those apart, and the difference is what decides whether the
// author gets a bubble. Pasting a URL, or typing one and hitting space, leaves the caret hard
// against the link's trailing edge — where `isActive` answers true — so the actions bubble opened
// over the footer every time somebody pasted a link they had just chosen themselves and already
// knew the address of.
//
// Inside means the characters on BOTH sides of the caret carry the link mark. Clicking into link
// text gives the bubble; authoring a link does not. The start boundary is treated the same as the
// end for the same reason: a caret there is next to the link, not in it.

import type { EditorState } from '@tiptap/pm/state'

/** False for an empty-document caret, a range selection, or a caret at either edge of a link. */
export function caretInsideLink(state: EditorState): boolean {
  const { selection } = state
  if (!selection.empty) {
    return false
  }
  const linkType = state.schema.marks.link
  if (!linkType) {
    return false
  }
  const { $from } = selection
  const before = $from.nodeBefore
  const after = $from.nodeAfter
  if (!before || !after) {
    return false
  }
  return linkType.isInSet(before.marks) !== undefined && linkType.isInSet(after.marks) !== undefined
}
