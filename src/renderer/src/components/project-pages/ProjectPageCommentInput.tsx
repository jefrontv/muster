// The page's note box: the plan review's popover, so page reviews and markdown reviews feel the same.
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { PlanReviewNotePopover } from '../plan-annotation/PlanReviewNotePopover'
import { ProjectPageCommentBubble } from './ProjectPageCommentBubble'
import type { PageCommentController } from './use-page-comment-controller'

export function ProjectPageCommentInput({
  controller
}: {
  controller: PageCommentController
}): React.JSX.Element {
  const { note, inReview } = controller
  return (
    <>
      <ProjectPageCommentBubble controller={controller} />
      {note ? (
        <PlanReviewNotePopover
          draft={note}
          showKinds={inReview}
          wholeTitle={
            inReview
              ? undefined
              : translate('auto.components.projectPages.comments.wholePage', 'Whole page')
          }
          notePlaceholder={
            inReview
              ? undefined
              : translate('auto.components.projectPages.comments.placeholder', 'Add a comment')
          }
          onCancel={controller.cancelDraft}
          onSubmit={controller.submitNote}
        />
      ) : null}
    </>
  )
}
