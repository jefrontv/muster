// The comment box that appears at the passage you selected.
//
// Why anchored rather than docked in a sidebar: the quote and the box have to be readable in one
// glance, or you lose track of what you were commenting on while typing.

import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, ThumbsUp, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'

const WIDTH = 380
const GAP = 10
const EDGE = 12

export type ComposerAnchor = {
  quote: string
  /** Viewport rect of the selection, captured when the composer opened. */
  rect: { top: number; bottom: number; left: number; right: number }
  /** Viewport rect of the scroll container, so the box cannot escape the document pane. */
  bounds: { top: number; bottom: number; left: number; right: number }
}

/** Verbs a reviewer can attach to a passage. Freeform prose alone loses the reviewer's intent. */
const KINDS: {
  kind: PlanAnnotationKind
  label: string
  icon: typeof MessageSquare
  /** True when the verb already says enough without prose. */
  standalone: boolean
}[] = [
  { kind: 'comment', label: 'Comment', icon: MessageSquare, standalone: false },
  { kind: 'delete', label: 'Remove', icon: Trash2, standalone: true },
  { kind: 'looks_good', label: 'Looks good', icon: ThumbsUp, standalone: true }
]

export function PlanAnnotationComposer({
  anchor,
  labels,
  onCancel,
  onSave
}: {
  anchor: ComposerAnchor
  /** Quick labels the reviewer can stamp on a passage, e.g. "scope", "test". */
  labels: readonly string[]
  onCancel: () => void
  onSave: (kind: PlanAnnotationKind, body: string, label?: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<PlanAnnotationKind>('comment')
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    textarea.current?.focus()
  }, [])

  /**
   * Positioned after measuring, before paint.
   *
   * Why measure rather than assume: the box grows with the textarea, and an assumed height put it
   * in the wrong place on first open — the bug that made this feel like it appeared at random.
   * Staying hidden until placed avoids a visible jump from the first guess to the real spot.
   */
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 0
    const { rect, bounds } = anchor
    const centred = rect.left + (rect.right - rect.left) / 2 - WIDTH / 2
    const maxLeft = Math.max(bounds.left + EDGE, bounds.right - WIDTH - EDGE)
    const left = Math.round(Math.min(Math.max(centred, bounds.left + EDGE), maxLeft))
    const below = rect.bottom + GAP
    const fitsBelow = below + height <= bounds.bottom - EDGE
    const top = Math.round(fitsBelow ? below : Math.max(bounds.top + EDGE, rect.top - GAP - height))
    setPlacement({ left, top })
  }, [anchor, body, kind])

  const canSave = body.trim().length > 0 || KINDS.find((entry) => entry.kind === kind)?.standalone
  const save = (label?: string): void => {
    if (label) {
      onSave('label', body.trim(), label)
      return
    }
    if (canSave) {
      onSave(kind, body.trim())
    }
  }

  // Why a portal to body: DialogContent is translated (-50%,-50%), and a transform makes an
  // element the containing block for position:fixed descendants. Rendered inside it, these
  // viewport coordinates were resolved against the dialog instead — the box landed anywhere.
  return createPortal(
    <div
      ref={box}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: WIDTH,
        visibility: placement ? 'visible' : 'hidden'
      }}
      className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
          <span className="line-clamp-2">“{anchor.quote}”</span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Discard comment"
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 pt-2">
        {KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            onClick={() => setKind(entry.kind)}
            aria-pressed={kind === entry.kind}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
              kind === entry.kind
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            }`}
          >
            <entry.icon className="size-3" />
            {entry.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Cmd/Ctrl+Enter submits; plain Enter stays available for multi-line feedback.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder={kind === 'comment' ? 'Add a comment…' : 'Add a note (optional)…'}
        rows={3}
        className="mt-1 block max-h-56 min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground/70"
      />

      {labels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-3 py-1.5">
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => save(label)}
              className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <kbd className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘↵
        </kbd>
        <Button size="sm" disabled={!canSave} onClick={() => save()}>
          Save
        </Button>
      </div>
    </div>,
    document.body
  )
}
