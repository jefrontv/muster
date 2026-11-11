// One waiting draft: what it is for, who wrote it, a short preview, and the actions on it.
import { ExternalLink, LoaderCircle, Trash2, Undo2, WandSparkles } from 'lucide-react'
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
import { BotsCommentDraftAttachments, postLabelWithFiles } from './BotsCommentDraftAttachments'
import { BotsDraftDialog, type BotsDraftDialogView } from './BotsDraftDialog'
import { BotsCommentDraftPostButton } from './BotsCommentDraftPostButton'
import { postCommentDraft } from './bots-comment-draft-post-action'
import { describeBotsCommentDraftFailure } from './bots-comment-draft-failure-message'
import { canonicalActiveCollabCommentHtml } from '../activecollab-comment-canonical-html'

type Action = 'post' | 'discard' | 'undo' | 'ask'

function IconAction({
  label,
  onClick,
  disabled,
  expanded,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  expanded?: boolean
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
          aria-expanded={expanded}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'text-chat-ink-tertiary hover:text-foreground',
            expanded && 'bg-foreground/[0.06] text-foreground'
          )}
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
  task
}: {
  draft: BotsCommentDraft
  task: BotsCommentDraftTask | undefined
}): React.JSX.Element {
  const [dialogView, setDialogView] = useState<BotsDraftDialogView | null>(null)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Tied to the version it was sent against, so it drops once the bot's amend arrives.
  const [notice, setNotice] = useState<{ text: string; version: number } | null>(null)

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
      setNotice({
        text: translate('auto.components.bots.commentDrafts.askSent', 'Sent to {{value0}}', {
          value0: draft.botName
        }),
        version: draft.version
      })
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

      {/* Paragraph gaps collapse so a blank line never spends one of the three clamped lines. */}
      <p className="line-clamp-3 text-[13px] leading-5 whitespace-pre-line text-foreground">
        {draft.bodyText.replace(/\n{2,}/g, '\n')}
      </p>
      <BotsCommentDraftAttachments draft={draft} />
      {dialogView ? (
        <BotsDraftDialog
          draft={draft}
          task={task}
          taskTitle={title}
          view={dialogView}
          onViewChange={setDialogView}
          onClose={() => setDialogView(null)}
        />
      ) : null}

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

      <div className="flex items-center gap-1">
        <BotsCommentDraftPostButton
          size="xs"
          label={postLabelWithFiles(
            translate('auto.components.bots.commentDrafts.post', 'Post'),
            draft
          )}
          busy={busy === 'post'}
          disabled={locked}
          projectId={draft.projectId}
          handBackPeople={task?.handBackPeople}
          getBodyHtml={() => draft.bodyHtml}
          onPost={(handBackTo) =>
            void run('post', () => postCommentDraft(draft, postArgs(draft), handBackTo))
          }
        />
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={locked}
          onClick={() => setDialogView('comment')}
        >
          {translate('auto.components.bots.commentDrafts.edit', 'Edit')}
        </Button>
        <div className="ml-auto flex shrink-0 items-center">
          <IconAction
            label={translate(
              'auto.components.bots.commentDrafts.ask',
              'Ask {{value0}} to change…',
              {
                value0: draft.botName
              }
            )}
            disabled={locked}
            expanded={asking}
            onClick={() => setAsking((open) => !open)}
          >
            <WandSparkles className="size-3.5" />
          </IconAction>
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
            onClick={() => setDialogView('task')}
          >
            <ExternalLink className="size-3.5" />
          </IconAction>
          <IconAction
            label={translate('auto.components.bots.commentDrafts.discard', 'Discard')}
            disabled={locked}
            onClick={() => void run('discard', () => window.api.bots.discardCommentDraft(draft.id))}
          >
            <Trash2 className="size-3.5" />
          </IconAction>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {notice?.version === draft.version ? (
        <p role="status" className="text-xs text-chat-ink-tertiary">
          {notice.text}
        </p>
      ) : null}
    </article>
  )
}
