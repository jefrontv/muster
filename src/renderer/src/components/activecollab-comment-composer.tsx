import React, { useCallback } from 'react'
import { useEditorState } from '@tiptap/react'
import { LoaderCircle, Paperclip, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { ActiveCollabRichBodyFrame, useActiveCollabRichBody } from './activecollab-rich-body-editor'
import { useActiveCollabCommentAttachments } from './use-activecollab-comment-attachments'

/**
 * The reply box: bold, italics, links, @mentions and file attachments, posted as the narrow HTML
 * ActiveCollab stores. The editor wiring lives in {@link useActiveCollabRichBody}, shared with the
 * create-task dialog; what is the composer's own is the POST lifecycle.
 *
 * Posting is UPLOAD THEN POST, and the draft is cleared by neither until both have landed. A
 * refused upload posts nothing and keeps every word; a post that fails after the files went up is
 * the one outcome nothing else can see, so it is named here rather than left as a generic failure.
 */
export function ActiveCollabCommentComposer({
  projectId,
  disabled,
  busy,
  onSubmit
}: {
  projectId: number | null
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string, attachmentCodes: string[]) => Promise<boolean>
}): React.JSX.Element {
  const body = useActiveCollabRichBody({
    projectId,
    disabled,
    placeholder: translate(
      'auto.components.activecollab.task_workspace.comment_placeholder',
      'Add an ActiveCollab comment...'
    ),
    ariaLabel: translate('auto.components.activecollab.task_workspace.comment_label', 'New comment')
  })
  const { editor } = body
  const attachments = useActiveCollabCommentAttachments()

  const hasText =
    useEditorState({
      editor,
      selector: ({ editor: current }) =>
        current === null ? false : hasBoundedCommentBodyText(current.getText())
    }) ?? false

  const submit = useCallback(() => {
    if (editor === null || disabled || attachments.busy || attachments.blocked) {
      return
    }
    const bodyHtml = activeCollabCommentBodyHtml(editor.state.doc)
    if (bodyHtml === '') {
      return
    }
    void (async () => {
      // Upload FIRST: a comment can only quote codes that already exist. A refusal stops right
      // here with the draft and every staged row untouched — nothing posted, so nothing lost.
      const codes = await attachments.upload()
      if (codes === null) {
        return
      }
      if (!(await onSubmit(bodyHtml, codes))) {
        if (codes.length > 0) {
          attachments.reportOrphanedUpload()
        }
        return
      }
      // Mentions are nodes in this document, so clearing the draft clears them: there is no pick
      // list left over to leak into the next comment. The staged files clear in step with it.
      editor.commands.clearContent(true)
      attachments.clear()
    })()
  }, [attachments, disabled, editor, onSubmit])

  return (
    <div className="mt-2" {...attachments.dropTargetProps}>
      <ActiveCollabRichBodyFrame
        body={body}
        attachments={attachments}
        disabled={disabled}
        dragging={attachments.dragging}
        footer={
          <div className="flex items-center justify-between gap-2 border-t border-border px-1.5 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              disabled={disabled || attachments.busy}
              onClick={attachments.pick}
            >
              <Paperclip className="size-3.5" />
              {translate('auto.components.activecollab.comment_attachments.attach', 'Attach Files')}
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={disabled || !hasText || attachments.busy || attachments.blocked}
              className="gap-2"
            >
              {busy || attachments.busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {translate('auto.components.activecollab.task_workspace.comment_submit', 'Comment')}
            </Button>
          </div>
        }
      />
    </div>
  )
}
