// The page's comment box: the plan review's popover without kinds (reviews use ProjectPageReviewNotes).
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
  const { note } = controller
  return (
    <>
      <ProjectPageCommentBubble controller={controller} />
      {note ? (
        <PlanReviewNotePopover
          draft={note}
          showKinds={false}
          wholeTitle={translate('auto.components.projectPages.comments.wholePage', 'Whole page')}
          notePlaceholder={translate(
            'auto.components.projectPages.comments.placeholder',
            'Add a comment'
          )}
          onCancel={controller.cancelDraft}
          onSubmit={controller.submitNote}
        />
      ) : null}
    </>
  )
}
