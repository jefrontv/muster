// Page review notes: the markdown plan review's open-on-selection behaviour and kind wording.
import type { Editor } from '@tiptap/react'
import { useEffect, type RefObject } from 'react'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'

/** Page threads have no kinds, so a remove / looks-good note says so in its text. */
export function pageNoteText(kind: PlanAnnotationKind, body: string): string {
  const text = body.trim()
  if (kind === 'delete') {
    return text ? `Remove: ${text}` : 'Remove this.'
  }
  if (kind === 'looks_good') {
    return text ? `Looks good: ${text}` : 'Looks good.'
  }
  return body
}

/** Like PlanReviewEditor: a mouse selection opens the note box; keyboard selections use the shortcut. */
export function useOpenNoteOnMouseSelection(
  rootRef: RefObject<HTMLElement | null>,
  editor: Editor | null,
  enabled: boolean,
  open: (selectionOnly: boolean) => boolean
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !editor || !enabled) {
      return
    }
    let selecting = false
    const down = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      selecting =
        event.button === 0 && target?.closest('.ProseMirror') != null && !target.closest('a')
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
  }, [editor, enabled, open, rootRef])
}
