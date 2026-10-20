import { memo, useMemo, useState } from 'react'
import type React from 'react'
import { CircleAlert, FileText, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { basename } from '@/lib/path'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from '@/components/native-chat/NativeChatCopyButton'
import { NativeChatImageThumb } from '@/components/native-chat/NativeChatImageThumb'
import { NativeChatTaskChip } from '@/components/native-chat/NativeChatTaskChip'
import type { ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { useChatThreadContext } from './chat-thread-context'
import { ChatItemList } from './ChatItemRows'
import { FoldHeader, RunningStatus, TurnOutcomeAnnouncement } from './ChatTurnChrome'
import { chatUserMessageParts, type ChatUserMessageParts } from './chat-user-message-parts'
import { formatElapsed } from './chat-tool-row-model'
import { answerText, foldKeepsVisible, turnFold, type ChatTurnFold } from './chat-turn-layout'
import { useChatEngineTurn } from './use-chat-engine-thread'

// Older turns reveal their actions on hover; the latest always shows them. Opacity only, so nothing shifts.
const actionsClass = (latest: boolean): string =>
  cn(
    'flex h-7 items-center gap-2',
    !latest &&
      '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-[80ms] [@media(hover:hover)]:group-hover/turn:opacity-100 [@media(hover:hover)]:focus-within:opacity-100'
  )

const actionButtonClass =
  'size-7 rounded-[8px] p-1.5 text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-chat-ink-secondary focus-visible:ring-chat-accent'

// DSH sizes glyphs 15px on the user row and 17px under the reply.
const userGlyph = '[&_svg]:size-[15px]'
const replyGlyph = '[&_svg]:size-[17px]'

/** The bubble and its attachments share one width cap; 70.2% of the column is DSH's 525/748. */
const userStackClass = 'flex min-w-0 max-w-[70.2%] flex-col items-end gap-2'

function UserAttachments(props: { parts: ChatUserMessageParts }): React.JSX.Element | null {
  const { images, files, taskIds } = props.parts
  if (images.length + files.length + taskIds.length === 0) {
    return null
  }
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      {images.map((path) => (
        <NativeChatImageThumb
          key={path}
          path={path}
          alt={translate('components.native-chat.composer.pastedImageLabel', 'Pasted image')}
          className="h-auto max-h-60 max-w-full rounded-xl"
          placeholderClassName="size-24 rounded-xl"
        />
      ))}
      {taskIds.map((taskId) => (
        <NativeChatTaskChip key={taskId} taskId={taskId} />
      ))}
      {files.map((path) => (
        <div
          key={path}
          title={path}
          className="flex max-w-full items-center gap-1.5 rounded-lg bg-chat-bubble px-2 py-1 text-xs text-chat-ink-secondary"
        >
          <FileText className="size-3.5 shrink-0" aria-hidden />
          <span className="max-w-56 truncate">{basename(path)}</span>
        </div>
      ))}
    </div>
  )
}

function UserMessage(props: {
  user: NonNullable<ChatEngineTurn['user']>
  latest: boolean
}): React.JSX.Element {
  const { user } = props
  const parts = useMemo(() => chatUserMessageParts(user.text), [user.text])
  // Images sent without a path note (older sends) can only be counted.
  const uncounted = Math.max(0, user.imageCount - parts.images.length)
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className={userStackClass}>
        <UserAttachments parts={parts} />
        {(parts.body || uncounted > 0) && (
          <div className="max-w-full whitespace-pre-wrap break-words rounded-chat-bubble bg-chat-bubble px-4 py-2.5 text-sm leading-[22px] text-foreground">
            {parts.body}
            {uncounted > 0 && (
              <div className="flex items-center gap-1 pt-1 text-xs text-chat-ink-tertiary">
                <ImageIcon className="size-3" aria-hidden />
                {uncounted === 1
                  ? translate('components.chat-thread.imageOne', '1 image')
                  : translate('components.chat-thread.imageMany', '{{count}} images', {
                      count: uncounted
                    })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className={actionsClass(props.latest)}>
        <NativeChatCopyButton text={parts.typed} className={cn(actionButtonClass, userGlyph)} />
      </div>
    </div>
  )
}

function TurnError(props: { message: string | null; onRetry?: () => void }): React.JSX.Element {
  return (
    <div role="alert" className="flex flex-col items-start gap-1.5">
      <div className="flex items-start gap-2 text-[13px] text-destructive">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">
          {props.message ??
            translate('components.chat-thread.turnFailed', 'Claude stopped with an error.')}
        </span>
      </div>
      {props.onRetry && (
        <Button variant="outline" size="xs" onClick={props.onRetry}>
          <RotateCcw aria-hidden />
          {translate('components.chat-thread.retry', 'Try again')}
        </Button>
      )}
    </div>
  )
}

function TurnActions(props: {
  turn: ChatEngineTurn
  answer: string
  folded: boolean
  latest: boolean
}): React.JSX.Element | null {
  const { turn } = props
  // A folded turn already says "Stopped" and the duration in its header.
  const stopped = !props.folded && turn.status === 'interrupted'
  const duration = !props.folded && turn.status === 'done' && Boolean(turn.durationMs)
  if (!props.answer && !stopped && !duration) {
    return null
  }
  return (
    // mt-1 makes 16px under the reply; -ml-1.5 puts the first glyph, not its box, on the text edge.
    <div className={cn('-ml-1.5 mt-1', actionsClass(props.latest || stopped))}>
      {props.answer && (
        <NativeChatCopyButton text={props.answer} className={cn(actionButtonClass, replyGlyph)} />
      )}
      {stopped && (
        <span className="rounded-md bg-chat-hover px-1.5 text-[11px] leading-[18px] text-chat-ink-secondary">
          {translate('components.chat-thread.turnInterrupted', 'Stopped')}
        </span>
      )}
      {duration && (
        <span className="px-1 font-mono text-xs tabular-nums text-chat-ink-tertiary">
          {formatElapsed(turn.durationMs! / 1000)}
        </span>
      )}
    </div>
  )
}

/** Done turns fold; stopped and failed ones get the same header but start open to show what happened. */
function settledFold(turn: ChatEngineTurn): ChatTurnFold | null {
  if (turn.status === 'interrupted' || turn.status === 'error') {
    return turnFold({ ...turn, status: 'done' })
  }
  return turnFold(turn)
}

/** Subscribes to its own turn, so another turn streaming never re-renders it. */
export const ChatTurnView = memo(function ChatTurnView(props: {
  threadId: string
  turnId: string
  latest: boolean
}): React.JSX.Element | null {
  const turn = useChatEngineTurn(props.threadId, props.turnId)
  const { onRetry } = useChatThreadContext()
  // null until toggled, so the default follows the outcome.
  const [processOpen, setProcessOpen] = useState<boolean | null>(null)
  if (!turn) {
    return null
  }
  const fold = settledFold(turn)
  const open = processOpen ?? turn.status !== 'done'
  const answer = turn.status === 'running' ? '' : answerText(fold ? fold.answer : turn.items)
  return (
    <section
      data-turn-id={turn.id}
      className="group/turn flex flex-col gap-3"
      aria-label={turn.user ? unwrapChatWorkspaceUserTurn(turn.user.text).slice(0, 80) : undefined}
    >
      {turn.user && <UserMessage user={turn.user} latest={props.latest} />}
      {fold ? (
        <>
          <FoldHeader turn={turn} open={open} onToggle={() => setProcessOpen(!open)} />
          {/* Closed hides the steps only; earlier replies stay readable. */}
          <ChatItemList items={open ? fold.process : fold.process.filter(foldKeepsVisible)} />
          <ChatItemList items={fold.answer} />
        </>
      ) : (
        <ChatItemList items={turn.items} />
      )}
      {turn.status === 'running' && <RunningStatus startedAt={turn.startedAt} />}
      {turn.status === 'error' && (
        <TurnError
          message={turn.errorMessage}
          // Only the latest: retrying an old failure would answer out of order.
          onRetry={
            onRetry && props.latest && turn.user
              ? () => onRetry(unwrapChatWorkspaceUserTurn(turn.user!.text))
              : undefined
          }
        />
      )}
      <TurnActions turn={turn} answer={answer} folded={Boolean(fold)} latest={props.latest} />
      {props.latest && <TurnOutcomeAnnouncement turn={turn} />}
    </section>
  )
})
