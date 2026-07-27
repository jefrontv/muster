import React, { useMemo } from 'react'

import { ActiveCollabAttachmentGrid } from '@/components/activecollab-attachment-grid'
import CommentMarkdown, { type ActiveCollabHtmlOptions } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabComment } from '../../../shared/activecollab-types'
import { ActiveCollabCommentComposer } from './activecollab-comment-composer'
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
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string) => void
}

/**
 * One comment, attributed. The author leads the card so a thread can be scanned by who spoke rather
 * than by reading each body; the timestamp trails it because it only matters once you care who.
 */
function ActiveCollabCommentCard({
  comment,
  activeCollabHtml
}: {
  comment: ActiveCollabComment
  activeCollabHtml: ActiveCollabHtmlOptions
}): React.JSX.Element {
  const posted = activeCollabStamp(comment.createdOn, 'date-time')
  return (
    // Why the heavier surface: at `border-border/50` over `bg-muted/20` the card edge was invisible
    // against the pane in the dark theme, so three replies read as one run of text. The card now
    // carries its own fill and a full-strength border, and the author band is tinted a step darker
    // so "who spoke" separates from "what they said" without another rule.
    <article className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <ActiveCollabPersonBadge name={comment.createdByName} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {comment.createdByName ??
            translate('auto.components.activecollab.task_workspace.unknown', 'Unknown')}
        </span>
        {posted ? (
          <time
            dateTime={posted.iso}
            className="ml-auto shrink-0 text-[11px] text-muted-foreground"
          >
            {posted.label}
          </time>
        ) : null}
      </div>
      <div className="px-3 py-2">
        <CommentMarkdown
          content={comment.bodyHtml}
          activeCollabHtml={activeCollabHtml}
          className="text-[13px] leading-relaxed"
        />
        <ActiveCollabAttachmentGrid attachments={comment.attachments} />
      </div>
    </article>
  )
}

export function ActiveCollabCommentThread({
  comments,
  activeCollabHtml,
  projectId,
  disabled,
  busy,
  onSubmit
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
            />
          ))}
        </div>
      )}
    </section>
  )
}
