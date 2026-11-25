// The plan review's margin controls, shared by markdown plan reviews and page reviews.
import type React from 'react'
import type { Editor } from '@tiptap/react'
import { MessageSquare, Plus } from 'lucide-react'
import type { PlanReviewHoverBlock } from './use-plan-review-hover-block'

/** The "+" beside the hovered block: selects the block and opens a note on it. */
export function PlanReviewGutterAdd({
  block,
  editor,
  openPassageDraft
}: {
  block: PlanReviewHoverBlock
  editor: Editor | null
  openPassageDraft: (requireLiveSelection?: boolean) => boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="orca-diff-comment-add-btn rich-markdown-comment-add-btn plan-review-gutter-add"
      style={{ top: block.top, left: block.left }}
      title="Add a note on this line"
      aria-label="Add a note on this line"
      // Keeps the editor focused, so the block selection it makes is live.
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!editor) {
          return
        }
        // view.focus() rather than the focus command: that defers a frame, and ProseMirror only
        // writes the selection to the DOM, where the draft reads it, once the view has focus.
        editor.view.focus()
        editor.commands.setTextSelection({ from: block.from, to: block.to })
        openPassageDraft(true)
      }}
    >
      <Plus className="size-3.5" />
    </button>
  )
}

/** The notes count that shows and hides the margin rail. */
export function PlanReviewRailToggle({
  annotations
}: {
  annotations: {
    comments: readonly unknown[]
    reviewRailOpen: boolean
    setReviewRailOpen: (update: (open: boolean) => boolean) => void
  }
}): React.JSX.Element | null {
  if (annotations.comments.length === 0) {
    return null
  }
  const label = annotations.reviewRailOpen ? 'Hide review notes' : 'Show review notes'
  return (
    <div className="rich-markdown-review-rail-actions">
      <button
        type="button"
        className="rich-markdown-review-rail-toggle"
        aria-expanded={annotations.reviewRailOpen}
        aria-label={label}
        title={label}
        onClick={() => annotations.setReviewRailOpen((open) => !open)}
      >
        <MessageSquare className="size-3.5" />
        <span>{annotations.comments.length}</span>
      </button>
    </div>
  )
}
