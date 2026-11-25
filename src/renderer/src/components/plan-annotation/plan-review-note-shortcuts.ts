// Lets the editor's own shortcuts work while the note box has focus: the box takes focus to be
// typed in, which would otherwise leave Cmd+C copying nothing and Cmd+B doing nothing.
import type { Editor } from '@tiptap/react'
import type React from 'react'

/** Keys the note field keeps: select all, paste, cut, undo, redo, submit. */
const FIELD_KEYS = new Set(['a', 'v', 'x', 'z', 'y', 'enter'])

export function forwardNoteShortcut(
  event: React.KeyboardEvent,
  editor: Editor | null | undefined,
  quote: string
): void {
  const mod = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
  if (!mod || !editor || editor.isDestroyed || event.nativeEvent.isComposing) {
    return
  }
  const key = event.key.toLowerCase()
  const field = event.target as { selectionStart?: unknown; selectionEnd?: unknown } | null
  const fieldSelected =
    typeof field?.selectionStart === 'number' && field.selectionStart !== field.selectionEnd
  if (key === 'c' && !event.shiftKey && !event.altKey) {
    // A selection inside the note copies as usual; otherwise copy the passage the note is about.
    if (fieldSelected || !quote) {
      return
    }
    event.preventDefault()
    void navigator.clipboard.writeText(quote)
    return
  }
  if (FIELD_KEYS.has(key)) {
    return
  }
  // The editor still holds the passage as its selection, so formatting lands on it.
  if (editor.view.someProp('handleKeyDown', (handle) => handle(editor.view, event.nativeEvent))) {
    event.preventDefault()
    event.stopPropagation()
  }
}
