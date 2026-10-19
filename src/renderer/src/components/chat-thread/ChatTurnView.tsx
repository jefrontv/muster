import { memo, useEffect, useState } from 'react'
import type React from 'react'
import { ChevronDown, CircleAlert, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from '@/components/native-chat/NativeChatCopyButton'
import type { ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { ChatItemList } from './ChatItemRows'
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

function UserMessage(props: {
  user: NonNullable<ChatEngineTurn['user']>
  latest: boolean
}): React.JSX.Element {
  const { user } = props
  // The first send carries the workspace brief ahead of what the user typed.
  const text = unwrapChatWorkspaceUserTurn(user.text)
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[70%] whitespace-pre-wrap break-words rounded-chat-bubble bg-chat-bubble px-4 py-2.5 text-sm leading-[22px] text-foreground">
        {text}
        {user.imageCount > 0 && (
          <div className="flex items-center gap-1 pt-1 text-xs text-chat-ink-tertiary">
            <ImageIcon className="size-3" aria-hidden />
            {user.imageCount === 1
              ? translate('components.chat-thread.imageOne', '1 image')
              : translate('components.chat-thread.imageMany', '{{count}} images', {
                  count: user.imageCount
                })}
          </div>
        )}
      </div>
      <div className={actionsClass(props.latest)}>
        <NativeChatCopyButton text={text} className={copyClass} />
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

function TurnError({ message }: { message: string | null }): React.JSX.Element {
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-destructive">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="font-medium">
        {message ?? translate('components.chat-thread.turnFailed', 'Claude stopped with an error.')}
      </span>
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
  const [processOpen, setProcessOpen] = useState(false)
  if (!turn) {
    return null
  }
  const fold = turnFold(turn)
  const answer = turn.status === 'running' ? '' : answerText(fold ? fold.answer : turn.items)
  return (
    <section
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
      {turn.status === 'error' && <TurnError message={turn.errorMessage} />}
      <TurnActions turn={turn} answer={answer} showDuration={!fold} latest={props.latest} />
    </section>
  )
})
