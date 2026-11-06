// The comment drafts column beside the Bots webview. Collapses to a rail with the waiting count;
// on narrow pages the open panel overlays the webview instead of taking a column.
import { MessageSquareText, PanelRightClose } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { BotsCommentDraftCard } from './BotsCommentDraftCard'
import type { BotsCommentDraftsState } from './use-bots-comment-drafts'

const PANEL_WIDTH = 'w-[340px]'

export function BotsCommentDraftsPanel({
  state,
  open,
  overlay,
  onOpenChange,
  onOpenTask
}: {
  state: Pick<BotsCommentDraftsState, 'drafts' | 'tasks' | 'error'>
  open: boolean
  overlay: boolean
  onOpenChange: (open: boolean) => void
  onOpenTask: (draft: BotsCommentDraft) => void
}): React.JSX.Element | null {
  const count = state.drafts.length
  // Once open with drafts, the panel outlives the last one (an empty state) until it is collapsed.
  const [kept, setKept] = useState(false)
  if (open && count > 0 && !kept) {
    setKept(true)
  } else if (!open && kept) {
    setKept(false)
  }
  if (count === 0 && !(open && kept)) {
    return null
  }
  const countLabel = translate(
    'auto.components.bots.commentDrafts.count',
    '{{value0}} comment drafts waiting',
    { value0: String(count) }
  )

  const rail = (
    <div className="flex w-11 shrink-0 flex-col items-center border-l border-chat-line-2 bg-background pt-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={countLabel}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            className="relative"
          >
            <MessageSquareText className="size-4" />
            {count > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-2xs font-medium text-background tabular-nums">
                {count}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{countLabel}</TooltipContent>
      </Tooltip>
    </div>
  )

  if (!open) {
    return rail
  }

  return (
    <>
      {overlay ? rail : null}
      <aside
        aria-label={translate('auto.components.bots.commentDrafts.panelLabel', 'Comment drafts')}
        onKeyDown={(event) => {
          if (overlay && event.key === 'Escape' && !event.defaultPrevented) {
            onOpenChange(false)
          }
        }}
        className={cn(
          'flex min-h-0 shrink-0 flex-col border-l border-chat-line-2 bg-background',
          PANEL_WIDTH,
          overlay && 'absolute inset-y-0 right-11 z-20 max-w-[calc(100%-2.75rem)] shadow-chat-panel'
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-chat-line-2 pr-2 pl-4">
          <h2 className="text-[13px] font-medium text-foreground">
            {translate('auto.components.bots.commentDrafts.title', 'Comment drafts')}
          </h2>
          {count > 0 ? (
            <span className="rounded-full bg-foreground/[0.07] px-1.5 text-2xs font-medium text-chat-ink-secondary tabular-nums">
              {count}
            </span>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-auto text-chat-ink-tertiary hover:text-foreground"
                aria-label={translate('auto.components.bots.commentDrafts.collapse', 'Collapse')}
                onClick={() => onOpenChange(false)}
              >
                <PanelRightClose className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {translate('auto.components.bots.commentDrafts.collapse', 'Collapse')}
            </TooltipContent>
          </Tooltip>
        </div>
        {state.error ? (
          <p
            role="status"
            className="border-b border-chat-line-2 px-4 py-2 text-xs text-destructive"
          >
            {translate(
              'auto.components.bots.commentDrafts.listFailed',
              'Could not refresh drafts: {{value0}}',
              { value0: state.error }
            )}
          </p>
        ) : null}
        {count === 0 ? (
          <div
            role="status"
            className="flex flex-1 flex-col items-center justify-center gap-1 px-6 pb-12 text-center"
          >
            <MessageSquareText className="mb-1 size-5 text-chat-ink-tertiary" />
            <p className="text-[13px] font-medium text-foreground">
              {translate('auto.components.bots.commentDrafts.emptyTitle', 'All caught up')}
            </p>
            <p className="text-xs text-chat-ink-tertiary">
              {translate(
                'auto.components.bots.commentDrafts.emptyBody',
                'New comment drafts from your bots show up here.'
              )}
            </p>
          </div>
        ) : (
          <ol className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {state.drafts.map((draft) => (
              <li key={draft.id}>
                <BotsCommentDraftCard
                  draft={draft}
                  task={state.tasks[draft.taskId]}
                  onOpenTask={onOpenTask}
                />
              </li>
            ))}
          </ol>
        )}
      </aside>
    </>
  )
}
