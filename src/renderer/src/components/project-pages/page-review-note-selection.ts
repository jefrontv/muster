// The markdown plan review's open-on-selection behaviour, for every page.
import type { Editor } from '@tiptap/react'
import { useEffect, type RefObject } from 'react'

/**
 * Like PlanReviewEditor: a mouse selection opens the note box; keyboard selections use Mod+Shift+A.
 * Not inside code blocks or table cells: selecting there is usually editing, and a box popping up
 * on every drag would get in the way. The shortcut still works there.
 */
export function useOpenNoteOnMouseSelection(
  rootRef: RefObject<HTMLElement | null>,
  editor: Editor | null,
  open: (selectionOnly: boolean) => boolean
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !editor) {
      return
    }
    let selecting = false
    const down = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      selecting =
        event.button === 0 &&
        target?.closest('.ProseMirror') != null &&
        !target.closest('a, pre, td, th')
    }
    const up = (): void => {
      if (!selecting) {
        return
      }
      selecting = false
      window.requestAnimationFrame(() => {
        if (!editor.isDestroyed && !editor.state.selection.empty) {
          open(true)
        }
      })
    }
    root.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    return () => {
      root.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
    }
  }, [editor, open, rootRef])
}
