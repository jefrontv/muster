import { memo, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { ChevronDown, CircleAlert, FileText, Image as ImageIcon, RotateCcw } from 'lucide-react'
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
import { chatUserMessageParts, type ChatUserMessageParts } from './chat-user-message-parts'
import { formatElapsed } from './chat-tool-row-model'
import { answerText, turnFold } from './chat-turn-layout'
import { useChatEngineTurn } from './use-chat-engine-thread'

// Older turns reveal their actions on hover; the latest always shows them. Opacity only, so nothing shifts.
const actionsClass = (latest: boolean): string =>
  cn(
    'flex items-center gap-1 transition-opacity duration-75',
    !latest &&
      '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/turn:opacity-100 [@media(hover:hover)]:focus-within:opacity-100'
  )

const copyClass = 'size-7 text-chat-ink-tertiary'

function UserAttachments(props: { parts: ChatUserMessageParts }): React.JSX.Element | null {
  const { images, files, taskIds } = props.parts
  if (images.length + files.length + taskIds.length === 0) {
    return null
  }
  return (
    <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5">
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
    <div className="flex flex-col items-end gap-1">
      <UserAttachments parts={parts} />
      {(parts.body || uncounted > 0) && (
        <div className="max-w-[70%] whitespace-pre-wrap break-words rounded-chat-bubble bg-chat-bubble px-4 py-2.5 text-sm leading-[22px] text-foreground">
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
      <div className={actionsClass(props.latest)}>
        <NativeChatCopyButton text={parts.typed} className={copyClass} />
      </div>
    </div>
  )
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

function RunningStatus({ startedAt }: { startedAt: number }): React.JSX.Element {
  const seconds = useElapsedSeconds(startedAt)
  return (
    <div className="chat-shimmer text-[13px] leading-[22px] tabular-nums text-chat-ink-tertiary">
      {translate('components.chat-thread.workingFor', 'Working for {{duration}}', {
        duration: formatElapsed(seconds)
      })}
    </div>
  )
}

function FoldHeader(props: {
  durationMs: number | null
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  const label = props.durationMs
    ? translate('components.chat-thread.workedFor', 'Worked for {{duration}}', {
        duration: formatElapsed(props.durationMs / 1000)
      })
    : translate('components.chat-thread.worked', 'Steps')
  return (
    <button
      type="button"
      aria-expanded={props.open}
      onClick={props.onToggle}
      className="flex h-[33px] w-full items-center gap-1.5 border-b-[0.5px] border-border pb-2 text-left text-sm tabular-nums text-chat-ink-tertiary transition-colors duration-100 hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <ChevronDown
        className={cn('size-3.5 transition-transform duration-100', props.open && 'rotate-180')}
        aria-hidden
      />
    </button>
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
  showDuration: boolean
  latest: boolean
}): React.JSX.Element | null {
  const { turn } = props
  const stopped = turn.status === 'interrupted'
  const duration = props.showDuration && turn.status === 'done' && Boolean(turn.durationMs)
  if (!props.answer && !stopped && !duration) {
    return null
  }
  return (
    // -ml-1.5 puts the first glyph, not its button box, on the text edge.
    <div className={cn('-ml-1.5', actionsClass(props.latest || stopped))}>
      {props.answer && <NativeChatCopyButton text={props.answer} className={copyClass} />}
      {stopped && (
        <span className="rounded-md bg-accent px-1.5 text-[11px] leading-[18px] text-chat-ink-secondary">
          {translate('components.chat-thread.turnInterrupted', 'Stopped')}
        </span>
      )}
      {duration && (
        <span className="px-1 text-xs tabular-nums text-chat-ink-tertiary">
          {formatElapsed(turn.durationMs! / 1000)}
        </span>
      )}
    </div>
  )
}

/** Subscribes to its own turn, so another turn streaming never re-renders it. */
export const ChatTurnView = memo(function ChatTurnView(props: {
  threadId: string
  turnId: string
  latest: boolean
}): React.JSX.Element | null {
  const turn = useChatEngineTurn(props.threadId, props.turnId)
  const { onRetry } = useChatThreadContext()
  const [processOpen, setProcessOpen] = useState(false)
  if (!turn) {
    return null
  }
  const fold = turnFold(turn)
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
          <FoldHeader
            durationMs={turn.durationMs}
            open={processOpen}
            onToggle={() => setProcessOpen((open) => !open)}
          />
          {processOpen && <ChatItemList items={fold.process} />}
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
      <TurnActions turn={turn} answer={answer} showDuration={!fold} latest={props.latest} />
    </section>
  )
})
