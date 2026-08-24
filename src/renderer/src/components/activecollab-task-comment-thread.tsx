import React, { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import { ActiveCollabAttachmentGrid } from '@/components/activecollab-attachment-grid'
import { attachmentsNotInlinedInBody } from '@/components/activecollab-inline-attachment-ids'
import CommentMarkdown, { type ActiveCollabHtmlOptions } from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabComment } from '../../../shared/activecollab-types'
import { ActiveCollabCommentComposer } from './activecollab-comment-composer'
import { ActiveCollabRichBodyEditor } from './activecollab-rich-body-editor'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { ActiveCollabTaskSectionHeading } from './activecollab-task-section-heading'
import { activeCollabStamp } from './activecollab-task-timestamps'

/**
 * Newest first, because the composer sits at the TOP of the discussion. Proximity should track
 * recency: the reply box, then the thing most recently said, then history going back. Pairing a
 * top composer with an oldest-first list would put the last thing anyone said at the far bottom,
 * so you would type a reply without the message you are replying to on screen.
 *
 * Total, not merely stable: `createdOn` is nullable and two comments can share a timestamp, so a
 * comparator that returned 0 for distinct rows would let them swap between renders. Undated
 * comments sort FIRST (they are almost always the local echo of a just-posted reply, which belongs
 * next to the composer) and id descending is the final tiebreak, matching post order because
 * ActiveCollab ids increase.
 */
export function sortActiveCollabCommentsNewestFirst(
  comments: readonly ActiveCollabComment[]
): ActiveCollabComment[] {
  return [...comments].sort((left, right) => {
    const leftAt = left.createdOn ?? Number.POSITIVE_INFINITY
    const rightAt = right.createdOn ?? Number.POSITIVE_INFINITY
    if (leftAt !== rightAt) {
      return rightAt - leftAt
    }
    return right.id - left.id
  })
}

type ActiveCollabCommentThreadProps = {
  comments: ActiveCollabComment[]
  /** Instance context, so a comment body resolves mentions and images like the task body does. */
  activeCollabHtml: ActiveCollabHtmlOptions
  /** Scopes the composer's @mention suggestions to the people on this project. */
  projectId: number | null
  /**
   * The signed-in user. Edit and delete exist ONLY on their own comments: ActiveCollab refuses the
   * write on anyone else's, so offering it would be a button whose only outcome is an error.
   */
  viewerId: number | null
  disabled: boolean
  busy: boolean
  /** Resolves TRUE only when the comment landed; the composer clears its draft off that. */
  onSubmit: (bodyHtml: string, attachmentCodes: string[]) => Promise<boolean>
  /** Resolves TRUE only when the edit landed; the card leaves its editor off that. */
  onEdit: (commentId: number, bodyHtml: string) => Promise<boolean>
  onDelete: (commentId: number) => void
}

/**
 * One comment, attributed. The author leads the card so a thread can be scanned by who spoke rather
 * than by reading each body; the timestamp trails it because it only matters once you care who.
 *
 * Own-comment actions are hover-revealed rather than always on: a thread is READ far more often
 * than it is edited, and a Delete button beside every message you wrote is an invitation.
 */
function ActiveCollabCommentCard({
  comment,
  activeCollabHtml,
  projectId,
  mine,
  disabled,
  busy,
  onEdit,
  onDelete
}: {
  comment: ActiveCollabComment
  activeCollabHtml: ActiveCollabHtmlOptions
  projectId: number | null
  mine: boolean
  disabled: boolean
  busy: boolean
  onEdit: (commentId: number, bodyHtml: string) => Promise<boolean>
  onDelete: (commentId: number) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const posted = activeCollabStamp(comment.createdOn, 'date-time')
  const editLabel = translate(
    'auto.components.activecollab.task_workspace.edit_comment',
    'Edit comment'
  )
  const deleteLabel = translate(
    'auto.components.activecollab.task_workspace.delete_comment',
    'Delete comment'
  )

  return (
    // Why the heavier surface: at `border-border/50` over `bg-muted/20` the card edge was invisible
    // against the pane in the dark theme, so three replies read as one run of text. The card now
    // carries its own fill and a full-strength border, and the author band is tinted a step darker
    // so "who spoke" separates from "what they said" without another rule.
    <article className="group overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <ActiveCollabPersonBadge name={comment.createdByName} userId={comment.createdById} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {comment.createdByName ??
            translate('auto.components.activecollab.task_workspace.unknown', 'Unknown')}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {posted ? (
            <time dateTime={posted.iso} className="text-[11px] text-muted-foreground">
              {posted.label}
            </time>
          ) : null}
          {mine && !editing ? (
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={editLabel}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={deleteLabel}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-3" />
              </Button>
            </span>
          ) : null}
        </span>
      </div>
      <div className="px-3 py-2">
        {editing ? (
          <ActiveCollabRichBodyEditor
            projectId={projectId}
            bodyHtml={comment.bodyHtml}
            disabled={disabled}
            busy={busy}
            ariaLabel={editLabel}
            placeholder={translate(
              'auto.components.activecollab.task_workspace.comment_placeholder',
              'Add an ActiveCollab comment...'
            )}
            onSave={(bodyHtml) => onEdit(comment.id, bodyHtml)}
            onClose={() => setEditing(false)}
          />
        ) : (
          <>
            <CommentMarkdown
              content={comment.bodyHtml}
              activeCollabHtml={activeCollabHtml}
              className="text-[13px] leading-relaxed"
            />
            <ActiveCollabAttachmentGrid
              attachments={attachmentsNotInlinedInBody(comment.attachments, comment.bodyHtml)}
            />
          </>
        )}
      </div>
      {/* Confirmed, not undoable: ActiveCollab has no restore for a deleted comment, so the one
          irreversible action in the thread is the one that asks. */}
      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleteLabel}</DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.activecollab.task_workspace.delete_comment_confirm',
                'This removes the comment from ActiveCollab for everyone. It cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              {translate('auto.components.activecollab.task_workspace.cancel_delete', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                setConfirmingDelete(false)
                onDelete(comment.id)
              }}
            >
              {translate('auto.components.activecollab.task_workspace.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}

export function ActiveCollabCommentThread({
  comments,
  activeCollabHtml,
  projectId,
  viewerId,
  disabled,
  busy,
  onSubmit,
  onEdit,
  onDelete
}: ActiveCollabCommentThreadProps): React.JSX.Element {
  const ordered = useMemo(() => sortActiveCollabCommentsNewestFirst(comments), [comments])

  return (
    <section className="px-4 py-4">
      <ActiveCollabTaskSectionHeading
        label={translate('auto.components.activecollab.task_workspace.discussion', 'Discussion')}
        count={comments.length}
      />

      {/* Composer first: replying is the action you came here to take, so it should not require
          scrolling past the whole history to reach. Newest-first below it means the message you
          are most likely replying to stays on screen while you type. */}
      <ActiveCollabCommentComposer
        projectId={projectId}
        disabled={disabled}
        busy={busy}
        onSubmit={onSubmit}
      />

      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {translate('auto.components.activecollab.task_workspace.no_comments', 'No comments yet.')}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {ordered.map((comment) => (
            <ActiveCollabCommentCard
              key={comment.id}
              comment={comment}
              activeCollabHtml={activeCollabHtml}
              projectId={projectId}
              // An unknown viewer owns nothing: without a signed-in id there is no comment we can
              // prove is ours, so the actions stay off rather than guessing from a name.
              mine={viewerId !== null && comment.createdById === viewerId}
              disabled={disabled}
              busy={busy}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
