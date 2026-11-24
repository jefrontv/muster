// Waiting comment drafts as an inbox: collapsed rows show a preview and actions; one row opens to show it all.
import { Bot, SquareTerminal } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { translate } from '@/i18n/i18n'
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
    <li className="border-b border-border px-3 py-2.5 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full min-w-0 flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex w-full min-w-0 items-baseline gap-2">
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
            title={title}
          >
            {title}
            {task?.taskNumber ? (
              <span className="ml-1.5 text-xs font-normal text-chat-ink-tertiary tabular-nums">
                #{task.taskNumber}
              </span>
            ) : null}
          </span>
          {age ? (
            <time dateTime={age.iso} className="shrink-0 text-[11px] text-chat-ink-tertiary">
              {age.label}
            </time>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-chat-ink-tertiary">
          <AuthorIcon aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            {[commentDraftAuthorLabel(draft), folder ?? task?.projectName]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
      <div id={bodyId} className="mt-1.5">
        <BotsCommentDraftCard draft={draft} task={task} bare expanded={open} onExpand={onToggle} />
      </div>
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
  // Rows start collapsed; their actions show either way.
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <ol className="flex flex-col">
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          task={tasks[draft.taskId]}
          open={openId === draft.id}
          onToggle={() => setOpenId(openId === draft.id ? null : draft.id)}
        />
      ))}
    </ol>
  )
}
