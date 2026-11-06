// One waiting draft: what it is for, who wrote it, a short preview, and the actions on it.
import { ExternalLink, LoaderCircle, Trash2, Undo2 } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  BotsCommentDraft,
  BotsCommentDraftPostArgs,
  BotsCommentDraftResult,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'
import { activeCollabStamp } from '../activecollab-task-timestamps'
import { BotsCommentDraftEditor } from './BotsCommentDraftEditor'
import { describeBotsCommentDraftFailure } from './bots-comment-draft-failure-message'
import { canonicalActiveCollabCommentHtml } from '../activecollab-comment-canonical-html'

type Action = 'post' | 'discard' | 'undo' | 'ask'

function IconAction({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="text-chat-ink-tertiary hover:text-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function editedLine(draft: BotsCommentDraft): string | null {
  if (draft.editedBy === 'user') {
    return translate('auto.components.bots.commentDrafts.editedByYou', 'Edited by you')
  }
  if (draft.version > 1) {
    return translate('auto.components.bots.commentDrafts.amendedBy', 'Amended by {{value0}}', {
      value0: draft.botName
    })
  }
  return null
}

/** A bot's HTML goes out only as the editor would write it; a cleaned body is saved before posting. */
function postArgs(draft: BotsCommentDraft): BotsCommentDraftPostArgs {
  const bodyHtml = canonicalActiveCollabCommentHtml(draft.bodyHtml)
  return bodyHtml === draft.bodyHtml
    ? { id: draft.id }
    : { id: draft.id, edit: { bodyHtml, bodyText: draft.bodyText, baseVersion: draft.version } }
}

export function BotsCommentDraftCard({
  draft,
  task,
  onOpenTask
}: {
  draft: BotsCommentDraft
  task: BotsCommentDraftTask | undefined
  onOpenTask: (draft: BotsCommentDraft) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = async <T,>(
    action: Action,
    call: () => Promise<BotsCommentDraftResult<T>>
  ): Promise<boolean> => {
    setBusy(action)
    setError(null)
    setNotice(null)
    const result = await call()
    setBusy(null)
    if (!result.ok) {
      setError(describeBotsCommentDraftFailure(result))
    }
    return result.ok
  }

  const sendNote = async (): Promise<void> => {
    const trimmed = note.trim()
    if (!trimmed) {
      return
    }
    if (
      await run('ask', () => window.api.bots.commentDraftFeedback({ id: draft.id, note: trimmed }))
    ) {
      setNote('')
      setAsking(false)
      setNotice(
        translate('auto.components.bots.commentDrafts.askSent', 'Sent to {{value0}}', {
          value0: draft.botName
        })
      )
    }
  }

  const title =
    task?.title ??
    translate('auto.components.bots.commentDrafts.taskFallback', 'Task #{{value0}}', {
      value0: String(draft.taskId)
    })
  const age = activeCollabStamp(draft.queuedAt, 'relative')
  const edited = editedLine(draft)
  const locked = busy !== null

  return (
    <article
      aria-label={title}
      className="flex flex-col gap-2 rounded-2xl bg-chat-raised p-3 shadow-chat-soft"
    >
      <header className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-2xs font-medium text-chat-ink-secondary tabular-nums"
        >
          {draft.number ?? '–'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-chat-ink-tertiary">
            {[task?.projectName, draft.botName].filter(Boolean).join(' · ')}
            {age ? (
              <>
                {' · '}
                <time dateTime={age.iso}>{age.label}</time>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {edited ? (
        <p className="text-xs text-chat-ink-secondary">
          {edited}
          {draft.editedBy === 'bot' && draft.amendNote ? (
            <span className="text-chat-ink-tertiary">{` · ${draft.amendNote}`}</span>
          ) : null}
        </p>
      ) : null}

      {editing ? (
        <BotsCommentDraftEditor draft={draft} onClose={() => setEditing(false)} />
      ) : (
        <p className="line-clamp-3 text-[13px] leading-5 whitespace-pre-line text-foreground">
          {draft.bodyText}
        </p>
      )}

      {asking ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void sendNote()
          }}
        >
          <Input
            autoFocus
            value={note}
            disabled={locked}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setAsking(false)
              }
            }}
            aria-label={translate(
              'auto.components.bots.commentDrafts.askLabel',
              'What should {{value0}} change?',
              { value0: draft.botName }
            )}
            placeholder={translate(
              'auto.components.bots.commentDrafts.askPlaceholder',
              'Make it shorter…'
            )}
            className="h-7 text-xs md:text-xs"
          />
          <Button type="submit" size="xs" disabled={locked || !note.trim()}>
            {busy === 'ask' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.bots.commentDrafts.askSend', 'Send')}
          </Button>
        </form>
      ) : null}

      {editing ? null : (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            disabled={locked}
            onClick={() =>
              void run('post', () => window.api.bots.postCommentDraft(postArgs(draft)))
            }
          >
            {busy === 'post' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.bots.commentDrafts.post', 'Post')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={locked}
            onClick={() => setEditing(true)}
          >
            {translate('auto.components.bots.commentDrafts.edit', 'Edit')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={locked}
            aria-expanded={asking}
            className={cn('min-w-0 truncate text-chat-ink-secondary', asking && 'text-foreground')}
            onClick={() => setAsking((open) => !open)}
          >
            {translate('auto.components.bots.commentDrafts.ask', 'Ask {{value0}} to change…', {
              value0: draft.botName
            })}
          </Button>
          <div className="ml-auto flex shrink-0 items-center">
            {draft.canUndo ? (
              <IconAction
                label={translate('auto.components.bots.commentDrafts.undo', 'Undo last change')}
                disabled={locked}
                onClick={() => void run('undo', () => window.api.bots.undoCommentDraft(draft.id))}
              >
                <Undo2 className="size-3.5" />
              </IconAction>
            ) : null}
            <IconAction
              label={translate('auto.components.bots.commentDrafts.openTask', 'Open task')}
              onClick={() => onOpenTask(draft)}
            >
              <ExternalLink className="size-3.5" />
            </IconAction>
            <IconAction
              label={translate('auto.components.bots.commentDrafts.discard', 'Discard')}
              disabled={locked}
              onClick={() =>
                void run('discard', () => window.api.bots.discardCommentDraft(draft.id))
              }
            >
              <Trash2 className="size-3.5" />
            </IconAction>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-chat-ink-tertiary">
          {notice}
        </p>
      ) : null}
    </article>
  )
}
