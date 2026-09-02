// The comment box that appears at the passage you selected.
//
// Why anchored rather than docked in a sidebar: the quote and the box have to be readable in one
// glance, or you lose track of what you were commenting on while typing.

import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  /**
   * Viewport origin of the positioned ancestor these coordinates are resolved against.
   *
   * Why not `position: fixed` and skip this: the dialog is translated (-50%,-50%), and a transform
   * makes it the containing block for fixed descendants — so fixed coordinates land in the wrong
   * place. Portalling out to <body> fixes the maths but escapes Radix's focus scope, which leaves
   * the box visible and completely unclickable. Absolute-inside-the-dialog is the option that gets
   * both right.
   */
  origin: { top: number; left: number }
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
  existing,
  onCancel,
  onDelete,
  onSave
}: {
  anchor: ComposerAnchor
  /** Quick labels the reviewer can stamp on a passage, e.g. "scope", "test". */
  labels: readonly string[]
  /** Present when reopening a saved note, so the box edits rather than adds. */
  existing: { kind: PlanAnnotationKind; body: string } | null
  onCancel: () => void
  onDelete: () => void
  onSave: (kind: PlanAnnotationKind, body: string, label?: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState(existing?.body ?? '')
  const [kind, setKind] = useState<PlanAnnotationKind>(
    existing && existing.kind !== 'global' ? existing.kind : 'comment'
  )
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<{
    left: number
    top: number
  } | null>(null)

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
    const { rect, bounds, origin } = anchor
    const centred = rect.left + (rect.right - rect.left) / 2 - WIDTH / 2
    const maxLeft = Math.max(bounds.left + EDGE, bounds.right - WIDTH - EDGE)
    const left = Math.min(Math.max(centred, bounds.left + EDGE), maxLeft)
    const below = rect.bottom + GAP
    const fitsBelow = below + height <= bounds.bottom - EDGE
    const top = fitsBelow ? below : Math.max(bounds.top + EDGE, rect.top - GAP - height)
    // All the clamping above is in viewport space; the box is absolute inside the dialog, so the
    // last step is a translation into that box's coordinates.
    setPlacement({
      left: Math.round(left - origin.left),
      top: Math.round(top - origin.top)
    })
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

  return (
    <div
      ref={box}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: WIDTH,
        visibility: placement ? 'visible' : 'hidden'
      }}
      // Why an explicit opaque background rather than inheriting the dialog's: the dialog is
      // translucent with a backdrop blur, and a panel floating over body text has to be readable
      // without the paragraph underneath bleeding through it.
      className="absolute z-50 overflow-hidden rounded-xl border border-border bg-[var(--popover)] shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-2 border-b border-border/60 bg-black/12 px-3 py-2 dark:bg-white/6">
        <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-foreground/75">
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
                : 'text-foreground/70 hover:bg-accent/60 hover:text-foreground'
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
        className="mt-1 block max-h-56 min-h-[72px] w-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
      />

      {labels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-3 py-1.5">
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => save(label)}
              className="rounded border border-border px-1.5 py-0.5 text-[10.5px] text-foreground/75 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/60">
            ⌘↵
          </kbd>
          {existing ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-[11px] text-muted-foreground transition-colors hover:text-destructive"
            >
              Delete note
            </button>
          ) : null}
        </div>
        <Button size="sm" disabled={!canSave} onClick={() => save()}>
          {existing ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
