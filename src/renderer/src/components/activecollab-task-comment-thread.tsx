import React, { useCallback, useMemo, useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'

import { ActiveCollabAttachmentGrid } from '@/components/activecollab-attachment-grid'
import CommentMarkdown, { type ActiveCollabHtmlOptions } from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import {
  getCommentBodySubmitState,
  hasBoundedCommentBodyText
} from '@/lib/comment-body-submit-state'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabComment } from '../../../shared/activecollab-types'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { ActiveCollabTaskSectionHeading } from './activecollab-task-section-heading'
import { activeCollabStamp } from './activecollab-task-timestamps'

/**
 * ActiveCollab stores comment bodies as HTML, so the composer's plain text is escaped and wrapped
 * rather than posted raw — otherwise a typed `<b>` would become live markup on the instance.
 */
export function activeCollabCommentBodyHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>')
    )
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('')
}

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
  disabled,
  busy,
  onSubmit
}: ActiveCollabCommentThreadProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const ordered = useMemo(() => sortActiveCollabCommentsNewestFirst(comments), [comments])

  const submit = useCallback(() => {
    const state = getCommentBodySubmitState(draft)
    if (state.status !== 'ready') {
      return
    }
    onSubmit(activeCollabCommentBodyHtml(state.body))
    setDraft('')
  }, [draft, onSubmit])

  return (
    <section className="px-4 py-4">
      <ActiveCollabTaskSectionHeading
        label={translate('auto.components.activecollab.task_workspace.discussion', 'Discussion')}
        count={comments.length}
      />

      {/* Composer first: replying is the action you came here to take, so it should not require
          scrolling past the whole history to reach. Newest-first below it means the message you
          are most likely replying to stays on screen while you type.

          Stacked, not side-by-side: the button used to sit `self-end` beside a two-row textarea,
          which left it floating against the field's bottom corner aligned to nothing. Full-width
          input with the action beneath it is the shape every other composer in the app uses. */}
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={translate(
            'auto.components.activecollab.task_workspace.comment_placeholder',
            'Add an ActiveCollab comment...'
          )}
          rows={3}
          disabled={disabled}
          aria-label={translate(
            'auto.components.activecollab.task_workspace.comment_label',
            'New comment'
          )}
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={disabled || !hasBoundedCommentBodyText(draft)}
            className="gap-2"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {translate('auto.components.activecollab.task_workspace.comment_submit', 'Comment')}
          </Button>
        </div>
      </div>

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
