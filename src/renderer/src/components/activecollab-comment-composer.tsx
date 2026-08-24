import React, { useCallback, useEffect, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { LoaderCircle, Paperclip, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { useAppStore } from '@/store'
import { activeCollabCommentBodyHtml } from './activecollab-comment-body-html'
import { ActiveCollabRichBodyFrame, useActiveCollabRichBody } from './activecollab-rich-body-editor'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { useActiveCollabCommentAttachments } from './use-activecollab-comment-attachments'

/**
 * The resting state: one line that looks like an input but is a button. A task pane is mostly read,
 * so the full composer — toolbar, body, attachment rail, actions — was charging every reader the
 * vertical cost of a reply they were not writing.
 */
function ActiveCollabCommentPrompt({
  disabled,
  onOpen
}: {
  disabled: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {translate(
        'auto.components.activecollab.task_workspace.comment_prompt',
        'Write a comment...'
      )}
    </button>
  )
}

/**
 * The open composer. Mounted only while expanded, which is what keeps the editor itself off a pane
 * nobody is replying on: the tiptap instance is created here, so a collapsed thread has none.
 *
 * Posting is UPLOAD THEN POST, and the draft is cleared by neither until both have landed. A
 * refused upload posts nothing and keeps every word; a post that fails after the files went up is
 * the one outcome nothing else can see, so it is named here rather than left as a generic failure.
 */
function ActiveCollabCommentForm({
  projectId,
  disabled,
  busy,
  onSubmit,
  onClose
}: {
  projectId: number | null
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string, attachmentCodes: string[]) => Promise<boolean>
  onClose: () => void
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

  // Expanding is the click that asked to type, so the caret goes in without a second one.
  useEffect(() => {
    editor?.commands.focus('end')
  }, [editor])

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
      onClose()
    })()
  }, [attachments, disabled, editor, onClose, onSubmit])

  const cancel = useCallback(() => {
    attachments.clear()
    onClose()
  }, [attachments, onClose])

  return (
    <div className="min-w-0 flex-1" {...attachments.dropTargetProps}>
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
            {/* `ml-auto` rather than a wrapper div: it keeps the submit button a direct child of
                the footer row, which is the structure the layout guard reads. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-[12px]"
              disabled={busy || attachments.busy}
              onClick={cancel}
            >
              {translate('auto.components.activecollab.task_workspace.comment_cancel', 'Cancel')}
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

/**
 * The reply box: bold, italics, links, @mentions and file attachments, posted as the narrow HTML
 * ActiveCollab stores. The editor wiring lives in {@link useActiveCollabRichBody}, shared with the
 * create-task dialog; what is the composer's own is the collapsed/expanded switch and the POST
 * lifecycle underneath it.
 *
 * Collapsing is not a blur: picking a file or reaching for the toolbar moves focus out of the
 * editor, so only Cancel and a landed post close it. Cancel discards, matching the description
 * editor rather than inventing a second rule for the same gesture.
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
  const [expanded, setExpanded] = useState(false)
  // The author is always the connected user, so the badge needs no prop threading through the
  // thread: whoever the token belongs to is who this comment will be attributed to.
  const connection = useAppStore((s) => s.activeCollabStatus.connection)
  const close = useCallback(() => setExpanded(false), [])

  return (
    <div className="mt-2 flex items-start gap-2.5">
      <ActiveCollabPersonBadge
        // Initials, not the roster's photo: the badge takes a userId to look one up, and that read
        // would make merely OPENING a task fetch every colleague. The author is already known.
        name={connection?.userName ?? null}
        className="mt-1 size-6 text-[10px]"
      />
      {expanded ? (
        <ActiveCollabCommentForm
          projectId={projectId}
          disabled={disabled}
          busy={busy}
          onSubmit={onSubmit}
          onClose={close}
        />
      ) : (
        <ActiveCollabCommentPrompt disabled={disabled} onOpen={() => setExpanded(true)} />
      )}
    </div>
  )
}
