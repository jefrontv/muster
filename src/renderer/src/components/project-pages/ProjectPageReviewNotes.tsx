// A page under plan review shows its notes the way a markdown plan review does: tinted marks by
// kind, margin cards, the "+" gutter, the same note box and the notes count.
import type { Editor } from '@tiptap/react'
import type React from 'react'
import { useEffect, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  PlanReviewGutterAdd,
  PlanReviewRailToggle
} from '../plan-annotation/PlanReviewMarginControls'
import { PlanReviewNoteLayer } from '../plan-annotation/PlanReviewNoteLayer'
import { PlanReviewNotePopover } from '../plan-annotation/PlanReviewNotePopover'
import { usePlanReviewHoverBlock } from '../plan-annotation/use-plan-review-hover-block'
import { richMarkdownAnnotationHighlightPluginKey } from '../editor/rich-markdown-annotation-highlight'
import type { PageCommentController } from './use-page-comment-controller'
import { usePageReviewNotes } from './use-page-review-notes'

export function ProjectPageReviewNotes({
  controller,
  editor,
  rootRef,
  scrollRef
}: {
  controller: PageCommentController
  editor: Editor | null
  /** Holds the note box; the plan review places it against this box. */
  rootRef: MutableRefObject<HTMLDivElement | null>
  /** The page's scroller, which the margin cards ride in. */
  scrollRef: MutableRefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const { annotations, markdown, removeNote, updateNote } = usePageReviewNotes({
    editor,
    threads: controller.reviewThreads,
    actions: controller.actions,
    rootRef,
    scrollRef
  })
  const { openPassageDraft, openWholePlanDraft, railExpanded } = annotations
  const { reviewRef } = controller
  useEffect(() => {
    reviewRef.current = { openPassage: openPassageDraft, openWhole: openWholePlanDraft }
    return () => {
      reviewRef.current = null
    }
  }, [openPassageDraft, openWholePlanDraft, reviewRef])

  // The review's marks live in the editor's plugin state, so they outlast this component unless cleared.
  useEffect(
    () => () => {
      if (editor && !editor.isDestroyed) {
        editor.view.dispatch(
          editor.state.tr.setMeta(richMarkdownAnnotationHighlightPluginKey, {
            noteRanges: [],
            activeRange: null
          })
        )
      }
    },
    [editor]
  )

  // The plan review's shell classes: its popover motion, rail spacing and toggle placement.
  useEffect(() => {
    const shell = rootRef.current?.closest('.rich-markdown-editor-shell')
    shell?.classList.add('plan-review-shell')
    shell?.classList.toggle('has-rich-markdown-review-notes', railExpanded)
    return () => shell?.classList.remove('plan-review-shell', 'has-rich-markdown-review-notes')
  }, [railExpanded, rootRef])

  const hover = usePlanReviewHoverBlock({
    editor,
    scrollContainerRef: scrollRef,
    disabled: annotations.draft !== null
  })
  const { onMouseMove, onMouseLeave } = hover
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) {
      return
    }
    const move = (event: MouseEvent): void =>
      onMouseMove(event as unknown as React.MouseEvent<HTMLDivElement>)
    scroller.addEventListener('mousemove', move)
    scroller.addEventListener('mouseleave', onMouseLeave)
    return () => {
      scroller.removeEventListener('mousemove', move)
      scroller.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [onMouseLeave, onMouseMove, scrollRef])

  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(rootRef.current), [rootRef])

  return (
    <>
      {hover.block && !annotations.draft ? (
        <PlanReviewGutterAdd
          block={hover.block}
          editor={editor}
          openPassageDraft={openPassageDraft}
        />
      ) : null}
      {annotations.reviewRailVisible && annotations.notePositions.length > 0 ? (
        <PlanReviewNoteLayer
          positions={annotations.notePositions}
          activeCommentId={annotations.activeReviewCommentId}
          attentionCommentId={annotations.attentionReviewCommentId}
          markdown={markdown}
          onScrollSourceIntoView={annotations.scrollRichMarkdownReviewNoteSourceIntoView}
          onDelete={removeNote}
          onSubmitEdit={updateNote}
          onContentResize={annotations.syncNotePositions}
        />
      ) : null}
      {host
        ? createPortal(
            <>
              {annotations.draft ? (
                <PlanReviewNotePopover
                  draft={annotations.draft}
                  editor={editor}
                  onCancel={annotations.cancelDraft}
                  onSubmit={annotations.submitDraft}
                />
              ) : null}
              <PlanReviewRailToggle annotations={annotations} />
            </>,
            host
          )
        : null}
    </>
  )
}
