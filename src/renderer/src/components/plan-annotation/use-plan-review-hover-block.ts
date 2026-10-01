// The text block under the pointer, so a gutter "+" can offer a note on that line or list item
// without the reviewer having to select anything first.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type React from 'react'
import type { Editor } from '@tiptap/react'

export type PlanReviewHoverBlock = {
  from: number
  to: number
  /** Scroll-content coordinates of the "+" button's top-left. */
  top: number
  left: number
}

const BUTTON_SIZE_PX = 24
const GUTTER_GAP_PX = 6

function findHoverBlock(
  editor: Editor,
  container: HTMLElement,
  x: number,
  y: number
): PlanReviewHoverBlock | null {
  const editorRect = editor.view.dom.getBoundingClientRect()
  const editorStyle = getComputedStyle(editor.view.dom)
  const contentLeft = editorRect.left + Number.parseFloat(editorStyle.paddingLeft)
  const contentRight = editorRect.right - Number.parseFloat(editorStyle.paddingRight)
  // Probe inside the text column at the pointer's height, so moving sideways toward the "+"
  // (which sits outside the column) keeps resolving to the same line.
  const probeX = Math.min(Math.max(x, contentLeft + 24), contentRight - 4)
  const hit = editor.view.posAtCoords({ left: probeX, top: y })
  if (!hit) {
    return null
  }
  const $pos = editor.state.doc.resolve(hit.pos)
  let depth = $pos.depth
  while (depth > 0 && !$pos.node(depth).isTextblock) {
    depth -= 1
  }
  const node = $pos.node(depth)
  if (depth === 0 || node.textContent.trim().length === 0) {
    return null
  }
  const dom = editor.view.nodeDOM($pos.before(depth))
  if (!(dom instanceof HTMLElement)) {
    return null
  }
  const rect = dom.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const lineHeight = Number.parseFloat(getComputedStyle(dom).lineHeight) || BUTTON_SIZE_PX
  // One gutter, right of the text column (where the notes rail is), centred on the block's first
  // line, so every block's "+" lines up whatever its indent.
  return {
    from: $pos.start(depth),
    to: $pos.end(depth),
    top:
      rect.top -
      containerRect.top +
      container.scrollTop +
      (Math.min(rect.height, lineHeight) - BUTTON_SIZE_PX) / 2,
    left: contentRight - containerRect.left + container.scrollLeft + GUTTER_GAP_PX
  }
}

export function usePlanReviewHoverBlock({
  editor,
  scrollContainerRef,
  disabled
}: {
  editor: Editor | null
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  /** True while a note draft is open: the gutter must not compete with it. */
  disabled: boolean
}): {
  block: PlanReviewHoverBlock | null
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave: () => void
} {
  const [block, setBlock] = useState<PlanReviewHoverBlock | null>(null)
  const frameRef = useRef<number | null>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (disabled) {
      setBlock(null)
    }
  }, [disabled])

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    },
    []
  )

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof Element ? event.target : null
      // Over the "+" itself: hold still, or it moves out from under the pointer about to click it.
      if (target?.closest('.plan-review-gutter-add')) {
        return
      }
      const overNotes = target?.closest(
        '.rich-markdown-review-note-layer, .orca-diff-comment-popover'
      )
      // A held button means a drag-select is under way; the gutter would only flicker under it.
      if (disabled || event.buttons !== 0 || overNotes) {
        pointRef.current = null
        setBlock(null)
        return
      }
      pointRef.current = { x: event.clientX, y: event.clientY }
      if (frameRef.current !== null) {
        return
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        const point = pointRef.current
        const container = scrollContainerRef.current
        if (!point || !editor || !container) {
          return
        }
        // Keep the last block across the gaps between paragraphs, so the "+" does not blink out
        // as the pointer crosses a margin; leaving the document clears it.
        const next = findHoverBlock(editor, container, point.x, point.y)
        if (next) {
          setBlock((current) =>
            current && current.from === next.from && current.top === next.top ? current : next
          )
        }
      })
    },
    [disabled, editor, scrollContainerRef]
  )

  const onMouseLeave = useCallback(() => {
    pointRef.current = null
    setBlock(null)
  }, [])

  return { block, onMouseMove, onMouseLeave }
}
