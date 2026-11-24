// Waiting comment drafts as compact rows; one row opens at a time to show its body and actions.
import { Bot, ChevronRight, Paperclip, SquareTerminal } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  BotsCommentDraft,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'
import { activeCollabStamp } from '../activecollab-task-timestamps'
import { BotsCommentDraftCard } from '../bots/BotsCommentDraftCard'
import { commentDraftAgentFolder, commentDraftAuthorLabel } from './comment-draft-author'

function DraftRow({
  draft,
  task,
  open,
  onToggle
}: {
  draft: BotsCommentDraft
  task: BotsCommentDraftTask | undefined
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const title =
    task?.title ??
    translate('auto.components.bots.commentDrafts.taskFallback', 'Task #{{value0}}', {
      value0: String(draft.taskId)
    })
  const age = activeCollabStamp(draft.queuedAt, 'relative')
  const AuthorIcon = draft.agentSource ? SquareTerminal : Bot
  const folder = commentDraftAgentFolder(draft)
  const bodyId = `comment-draft-${draft.id}`

  return (
    <li
      className={cn(
        'rounded-xl transition-colors',
        open ? 'bg-chat-raised shadow-chat-soft' : 'hover:bg-foreground/[0.04]'
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full min-w-0 items-start gap-2 rounded-xl px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 size-3.5 shrink-0 text-chat-ink-tertiary transition-transform',
            open && 'rotate-90'
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground" title={title}>
              {title}
            </span>
            {task?.taskNumber ? (
              <span className="shrink-0 text-xs text-chat-ink-tertiary tabular-nums">
                #{task.taskNumber}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-chat-ink-tertiary">
            <AuthorIcon aria-hidden className="size-3 shrink-0" />
            <span className="truncate">
              {[commentDraftAuthorLabel(draft), folder ?? task?.projectName]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {draft.attachments.length > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 tabular-nums">
                <Paperclip aria-hidden className="size-3" />
                {draft.attachments.length}
              </span>
            ) : null}
            {age ? (
              <time dateTime={age.iso} className="ml-auto shrink-0 pl-1">
                {age.label}
              </time>
            ) : null}
          </span>
          {open ? null : (
            <span className="mt-1 line-clamp-1 text-xs text-chat-ink-secondary">
              {draft.bodyText.replace(/\s+/g, ' ')}
            </span>
          )}
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="px-2.5 pb-2.5 pl-8">
          <BotsCommentDraftCard draft={draft} task={task} bare />
        </div>
      ) : null}
    </li>
  )
}

export function CommentDraftList({
  drafts,
  tasks
}: {
  drafts: BotsCommentDraft[]
  tasks: Record<number, BotsCommentDraftTask>
}): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null)
  // The newest draft opens by default; a closed row stays closed.
  const effectiveOpen = openId === null ? (drafts[0]?.id ?? null) : openId

  return (
    <ol className="flex flex-col gap-1">
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          task={tasks[draft.taskId]}
          open={effectiveOpen === draft.id}
          onToggle={() => setOpenId(effectiveOpen === draft.id ? '' : draft.id)}
        />
      ))}
    </ol>
  )
}
