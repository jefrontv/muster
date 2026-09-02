// The comment box that appears at the passage you selected.
//
// Why anchored rather than docked in a sidebar: the quote and the box have to be readable in one
// glance, or you lose track of what you were commenting on while typing.

import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const WIDTH = 380
const MARGIN = 12

export type ComposerAnchor = {
  quote: string
  /** Viewport rect of the selection, used to place the box beside it. */
  rect: { top: number; bottom: number; left: number; right: number }
}

export function PlanAnnotationComposer({
  anchor,
  bounds,
  onCancel,
  onSave
}: {
  anchor: ComposerAnchor
  /** The scroll container's viewport rect, so the box never escapes the document pane. */
  bounds: DOMRect
  onCancel: () => void
  onSave: (body: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const [height, setHeight] = useState(0)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    textarea.current?.focus()
  }, [])

  // Measure before paint so the box never flashes at the wrong end of the selection.
  useLayoutEffect(() => {
    setHeight(box.current?.offsetHeight ?? 0)
  }, [body])

  const left = Math.min(
    Math.max(anchor.rect.left, bounds.left + MARGIN),
    bounds.right - WIDTH - MARGIN
  )
  // Prefer below the selection; flip above when that would run off the bottom of the pane.
  const below = anchor.rect.bottom + MARGIN
  const fitsBelow = below + height <= bounds.bottom - MARGIN
  const top = fitsBelow ? below : Math.max(bounds.top + MARGIN, anchor.rect.top - height - MARGIN)

  const save = (): void => {
    const text = body.trim()
    if (text.length > 0) {
      onSave(text)
    }
  }

  return (
    <div
      ref={box}
      style={{ left, top, width: WIDTH }}
      className="fixed z-50 rounded-lg border border-border bg-popover shadow-lg"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          “{anchor.quote}”
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Discard comment"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        ref={textarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Why Cmd/Ctrl+Enter: plain Enter has to stay available for multi-line feedback.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder="Add a comment…"
        className="min-h-[84px] w-full resize-y bg-transparent px-3 py-2 text-xs outline-none"
      />
      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-3 py-2">
        <kbd className="text-[10px] text-muted-foreground">⌘↵</kbd>
        <Button size="sm" disabled={body.trim().length === 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}
