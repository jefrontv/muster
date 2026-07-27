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
 * Oldest first, so a thread reads top-to-bottom and the newest comment lands directly above the
 * composer you are about to reply in. ActiveCollab returns comments newest-first, which puts the
 * latest message furthest from the reply box and makes the conversation read backwards.
 *
 * Total, not merely stable: `createdOn` is nullable and two comments can share a timestamp, so a
 * comparator that returned 0 for distinct rows would let them swap between renders. Undated
 * comments sort to the end (they are almost always a local echo of a just-posted reply) and id
 * ascending is the final tiebreak, which matches post order because ActiveCollab ids increase.
 */
export function sortActiveCollabCommentsOldestFirst(
  comments: readonly ActiveCollabComment[]
): ActiveCollabComment[] {
  return [...comments].sort((left, right) => {
    const leftAt = left.createdOn ?? Number.POSITIVE_INFINITY
    const rightAt = right.createdOn ?? Number.POSITIVE_INFINITY
    if (leftAt !== rightAt) {
      return leftAt - rightAt
    }
    return left.id - right.id
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
  const ordered = useMemo(() => sortActiveCollabCommentsOldestFirst(comments), [comments])

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

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate('auto.components.activecollab.task_workspace.no_comments', 'No comments yet.')}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {ordered.map((comment) => (
            <ActiveCollabCommentCard
              key={comment.id}
              comment={comment}
              activeCollabHtml={activeCollabHtml}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={translate(
            'auto.components.activecollab.task_workspace.comment_placeholder',
            'Add an ActiveCollab comment...'
          )}
          rows={2}
          disabled={disabled}
          aria-label={translate(
            'auto.components.activecollab.task_workspace.comment_label',
            'New comment'
          )}
          className="min-h-10 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <Button
          onClick={submit}
          disabled={disabled || !hasBoundedCommentBodyText(draft)}
          className="self-end gap-2"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {translate('auto.components.activecollab.task_workspace.comment_submit', 'Comment')}
        </Button>
      </div>
    </section>
  )
}
