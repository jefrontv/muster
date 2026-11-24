// Right sidebar tab: waiting comment drafts for the open project, with every project one click away.
import { MessageSquareText } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { CommentDraftList } from './CommentDraftList'
import { useScopedCommentDrafts } from './comment-draft-project-filter'

export default function CommentDraftsSidebarPanel(): React.JSX.Element {
  const { drafts, scoped, hasScope, tasks, error, loaded } = useScopedCommentDrafts()
  const [showAll, setShowAll] = useState(false)
  const shown = showAll || !hasScope ? drafts : scoped
  const elsewhere = drafts.length - scoped.length

  const scopeButton = (all: boolean, label: string, count: number): React.JSX.Element => (
    <button
      type="button"
      aria-pressed={showAll === all}
      onClick={() => setShowAll(all)}
      className={cn(
        'rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
        showAll === all
          ? 'bg-foreground/[0.1] text-foreground'
          : 'text-chat-ink-tertiary hover:text-foreground'
      )}
    >
      {label} <span className="tabular-nums">{count}</span>
    </button>
  )

  return (
    <section
      aria-label={translate('auto.components.bots.commentDrafts.panelLabel', 'Comment drafts')}
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex h-10 shrink-0 items-center gap-2 px-3">
        <h2 className="text-[13px] font-medium text-foreground">
          {translate('auto.components.bots.commentDrafts.title', 'Comment drafts')}
        </h2>
        {hasScope && drafts.length > 0 ? (
          <div className="ml-auto flex items-center gap-0.5">
            {scopeButton(
              false,
              translate('auto.components.commentDrafts.thisProject', 'This project'),
              scoped.length
            )}
            {scopeButton(
              true,
              translate('auto.components.commentDrafts.allProjects', 'All'),
              drafts.length
            )}
          </div>
        ) : null}
      </header>
      {error ? (
        <p role="status" className="px-3 pb-2 text-xs text-destructive">
          {translate(
            'auto.components.bots.commentDrafts.listFailed',
            'Could not refresh drafts: {{value0}}',
            { value0: error }
          )}
        </p>
      ) : null}
      {loaded && shown.length === 0 ? (
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-1 px-6 pb-12 text-center"
        >
          <MessageSquareText className="mb-1 size-5 text-chat-ink-tertiary" />
          <p className="text-[13px] font-medium text-foreground">
            {translate('auto.components.bots.commentDrafts.emptyTitle', 'All caught up')}
          </p>
          <p className="text-xs text-chat-ink-tertiary">
            {elsewhere > 0
              ? translate('auto.components.commentDrafts.emptyHere', 'No drafts for this project.')
              : translate(
                  'auto.components.commentDrafts.sidebarEmptyBody',
                  'Comments your bots and agents draft show up here for you to post.'
                )}
          </p>
          {elsewhere > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="mt-1"
              onClick={() => setShowAll(true)}
            >
              {translate(
                'auto.components.commentDrafts.showOther',
                'Show {{value0}} from other projects',
                {
                  value0: String(elsewhere)
                }
              )}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          <CommentDraftList drafts={shown} tasks={tasks} />
        </div>
      )}
    </section>
  )
}
