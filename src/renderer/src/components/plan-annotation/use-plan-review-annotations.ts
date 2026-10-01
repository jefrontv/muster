// Annotation state for the plan review, wired the way the markdown viewer wires its own.
//
// Selection, the add-note button, the draft popover and the margin rail all run on the markdown
// viewer's helpers; only the note store differs. Notes live in the review's draft rather than in
// a worktree's diff comments, because a plan handed over by an agent belongs to no worktree.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Editor } from '@tiptap/react'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'
import { richMarkdownAnnotationHighlightPluginKey } from '../editor/rich-markdown-annotation-highlight'
import {
  clampRichMarkdownAnnotationTarget,
  getRichMarkdownAnnotationHighlightRangesForComment,
  getRichMarkdownAnnotationTarget,
  hasRichMarkdownCommentForRange,
  type RichMarkdownAnnotationTarget
} from '../editor/rich-markdown-review-annotations'
import { shouldExpandRichMarkdownReviewRail } from '../editor/rich-markdown-review-note-layout'
import { flushPendingProseMirrorSelection } from '../editor/rich-markdown-selection-flush'
import { useRichMarkdownReviewRailController } from '../editor/useRichMarkdownReviewRailController'
import { createNote, type DraftNote } from './plan-annotation-notes'
import { narrowLinesToQuote, planNoteTone, toPlanReviewComment } from './plan-review-comments'

const POPOVER_WIDTH_PX = 420
const POPOVER_RIGHT_OFFSET_PX = 24
const POPOVER_MIN_LEFT_PX = 56
const POPOVER_EDGE_PX = 16
const SELECTION_GAP_PX = 8
const WHOLE_PLAN_POPOVER_TOP_PX = 56

export type PlanNoteDraft =
  | {
      scope: 'passage'
      target: RichMarkdownAnnotationTarget
      /** Selection height plus both gaps, so the popover can flip above the text near the bottom. */
      flipHeight: number
    }
  | { scope: 'whole-plan'; top: number; left: number }

/**
 * Places the note box just under the selection, starting where the selection starts.
 *
 * Why not the markdown viewer's placement: that docks the box at the pane's right edge, which
 * leaves the reviewer's eyes travelling across the page between the text and what they type.
 */
function placeBelowSelection(
  root: HTMLElement
): { top: number; left: number; flipHeight: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const first = [...range.getClientRects()].find((candidate) => candidate.width > 0) ?? rect
  if (rect.height === 0 && rect.width === 0) {
    return null
  }
  const rootRect = root.getBoundingClientRect()
  const maxLeft = Math.max(POPOVER_EDGE_PX, rootRect.width - POPOVER_WIDTH_PX - POPOVER_EDGE_PX)
  return {
    top: rect.bottom - rootRect.top + SELECTION_GAP_PX,
    left: Math.min(Math.max(first.left - rootRect.left, POPOVER_EDGE_PX), maxLeft),
    flipHeight: rect.height + SELECTION_GAP_PX * 2
  }
}

export function usePlanReviewAnnotations({
  editor,
  editorRef,
  markdown,
  notes,
  rootRef,
  scrollContainerRef,
  onAddNote
}: {
  editor: Editor | null
  editorRef: MutableRefObject<Editor | null>
  /** Live serialization, so card positions follow edits. */
  markdown: string
  notes: readonly DraftNote[]
  rootRef: MutableRefObject<HTMLDivElement | null>
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  onAddNote: (note: DraftNote) => void
}) {
  const comments = useMemo(() => notes.map(toPlanReviewComment), [notes])
  const commentsRef = useRef(comments)
  commentsRef.current = comments
  const lineOffsetRef = useRef(0)
  const [target, setTarget] = useState<RichMarkdownAnnotationTarget | null>(null)
  const [draft, setDraft] = useState<PlanNoteDraft | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const targetFrameRef = useRef<number | null>(null)

  const rail = useRichMarkdownReviewRailController({
    canAnnotateRichMarkdown: true,
    content: markdown,
    editorRef,
    markdownComments: comments,
    markdownSourceLineOffset: 0,
    markdownSourceLineOffsetRef: lineOffsetRef,
    scrollContainerRef
  })
  const { setReviewRailOpen } = rail
  // A draft does not reserve the rail (unlike the markdown viewer): its box opens under the
  // selection, so moving the whole plan aside for it would only make the text jump.
  const railExpanded = shouldExpandRichMarkdownReviewRail({
    hasReviewNotes: comments.length > 0,
    reviewRailOpen: rail.reviewRailOpen,
    hasDraftNote: false
  })

  // A review exists to collect notes, so the rail starts open rather than behind the count chip.
  useEffect(() => setReviewRailOpen(true), [setReviewRailOpen])

  useEffect(() => {
    if (!editor) {
      return
    }
    const noteRanges = comments.flatMap((comment) =>
      getRichMarkdownAnnotationHighlightRangesForComment(editor, comment, 0).map((range) => ({
        ...range,
        tone: planNoteTone(comment.planKind)
      }))
    )
    editor.view.dispatch(
      editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, { noteRanges })
    )
  }, [comments, editor, markdown])

  const clearActiveHighlight = useCallback((): void => {
    const live = editorRef.current
    live?.view.dispatch(live.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, null))
  }, [editorRef])

  const syncTarget = useCallback(
    (live: Editor): void => {
      if (targetFrameRef.current !== null) {
        window.cancelAnimationFrame(targetFrameRef.current)
      }
      targetFrameRef.current = window.requestAnimationFrame(() => {
        targetFrameRef.current = null
        const root = rootRef.current
        if (!root || draftRef.current) {
          setTarget(null)
          return
        }
        const next = getRichMarkdownAnnotationTarget(live, root)
        const covered = next && hasRichMarkdownCommentForRange(commentsRef.current, next, 0)
        setTarget(covered ? null : next)
      })
    },
    [rootRef]
  )

  const clearTarget = useCallback((): void => setTarget(null), [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!editor || !container) {
      return
    }
    const update = (): void => syncTarget(editor)
    container.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      container.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (targetFrameRef.current !== null) {
        window.cancelAnimationFrame(targetFrameRef.current)
      }
    }
  }, [editor, scrollContainerRef, syncTarget])

  /** Returns whether a draft opened (or one was already open), for keyboard callers. */
  const openPassageDraft = useCallback(
    (requireLiveSelection = false): boolean => {
      if (draftRef.current) {
        return true
      }
      const live = editorRef.current
      const root = rootRef.current
      if (live) {
        flushPendingProseMirrorSelection(live)
      }
      const liveTarget = live && root ? getRichMarkdownAnnotationTarget(live, root) : null
      const base = liveTarget ?? (requireLiveSelection ? null : target)
      const next = base && live ? clampRichMarkdownAnnotationTarget(live, base) : base
      if (!next || hasRichMarkdownCommentForRange(commentsRef.current, next, 0)) {
        setTarget(null)
        return false
      }
      live?.view.dispatch(
        live.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, {
          activeRange: { from: next.from, to: next.to }
        })
      )
      const placement = root ? placeBelowSelection(root) : null
      const opened: PlanNoteDraft = {
        scope: 'passage',
        target: placement ? { ...next, top: placement.top, left: placement.left } : next,
        flipHeight: placement?.flipHeight ?? 0
      }
      draftRef.current = opened
      setReviewRailOpen(true)
      setDraft(opened)
      setTarget(null)
      return true
    },
    [editorRef, rootRef, setReviewRailOpen, target]
  )

  const openWholePlanDraft = useCallback((): void => {
    const width = rootRef.current?.getBoundingClientRect().width ?? 0
    const opened: PlanNoteDraft = {
      scope: 'whole-plan',
      top: WHOLE_PLAN_POPOVER_TOP_PX,
      left: Math.max(POPOVER_MIN_LEFT_PX, width - POPOVER_WIDTH_PX - POPOVER_RIGHT_OFFSET_PX)
    }
    draftRef.current = opened
    clearActiveHighlight()
    setTarget(null)
    setDraft(opened)
  }, [clearActiveHighlight, rootRef])

  const cancelDraft = useCallback((): void => {
    draftRef.current = null
    setDraft(null)
    clearActiveHighlight()
  }, [clearActiveHighlight])

  const submitDraft = useCallback(
    (kind: PlanAnnotationKind, body: string, attachments: string[]): void => {
      const open = draftRef.current
      if (!open) {
        return
      }
      onAddNote(
        open.scope === 'passage'
          ? createNote({
              kind,
              body,
              attachments,
              anchor: {
                quote: open.target.selectedText,
                ...narrowLinesToQuote(
                  markdown,
                  {
                    startLine: open.target.startLine ?? open.target.lineNumber,
                    endLine: open.target.lineNumber
                  },
                  open.target.selectedText
                )
              }
            })
          : createNote({ kind: 'global', body, attachments, anchor: null })
      )
      cancelDraft()
      window.getSelection()?.removeAllRanges()
    },
    [cancelDraft, markdown, onAddNote]
  )

  return {
    ...rail,
    comments,
    commentsRef,
    target,
    draft,
    railExpanded,
    syncTarget,
    clearTarget,
    openPassageDraft,
    openWholePlanDraft,
    cancelDraft,
    submitDraft
  }
}
