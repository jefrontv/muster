import React, { useCallback, useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'

import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import {
  getCommentBodySubmitState,
  hasBoundedCommentBodyText
} from '@/lib/comment-body-submit-state'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabComment } from '../../../shared/activecollab-types'

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
  disabled: boolean
  busy: boolean
  onSubmit: (bodyHtml: string) => void
}

export function ActiveCollabCommentThread({
  comments,
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
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">
          {translate('auto.components.activecollab.task_workspace.comments', 'Comments')}
        </span>
        {comments.length > 0 ? (
          <span className="text-[12px] text-muted-foreground">{comments.length}</span>
        ) : null}
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate('auto.components.activecollab.task_workspace.no_comments', 'No comments yet.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-md border border-border/50 bg-muted/20">
              <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-2">
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {comment.createdByName ??
                    translate('auto.components.activecollab.task_workspace.unknown', 'Unknown')}
                </span>
                {comment.createdOn !== null ? (
                  <time
                    dateTime={new Date(comment.createdOn).toISOString()}
                    className="shrink-0 text-[12px] text-muted-foreground"
                  >
                    {new Date(comment.createdOn).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </time>
                ) : null}
              </div>
              <div className="px-3 py-2">
                <CommentMarkdown
                  content={comment.bodyHtml}
                  className="text-[13px] leading-relaxed"
                />
              </div>
            </article>
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
