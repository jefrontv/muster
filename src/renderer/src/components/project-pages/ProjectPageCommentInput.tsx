// The page's note box: the plan review's popover, so plain pages take notes like reviews do.
import type { Editor } from '@tiptap/react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { PlanReviewNotePopover } from '../plan-annotation/PlanReviewNotePopover'
import type { PageCommentController } from './use-page-comment-controller'

export function ProjectPageCommentInput({
  controller,
  editor
}: {
  controller: PageCommentController
  editor: Editor | null
}): React.JSX.Element | null {
  const { note } = controller
  if (!note) {
    return null
  }
  return (
    <PlanReviewNotePopover
      draft={note}
      editor={editor}
      wholeTitle={translate('auto.components.projectPages.comments.wholePage', 'Whole page')}
      notePlaceholder={translate(
        'auto.components.projectPages.comments.placeholder',
        'Add a comment'
      )}
      onCancel={controller.cancelDraft}
      onSubmit={controller.submitNote}
    />
  )
}
