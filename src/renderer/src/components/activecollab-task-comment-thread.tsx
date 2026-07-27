import React, { useCallback, useState } from 'react'
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
    <article className="rounded-md border border-border/50 bg-muted/20">
      <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-2">
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
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
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
