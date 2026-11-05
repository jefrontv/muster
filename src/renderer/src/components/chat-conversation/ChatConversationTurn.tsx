// One engine turn in Chat mode: the user's bubble, the steps as cards and pills,
// and the reply as cards or prose.

import { memo, useState } from 'react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from '@/components/native-chat/NativeChatCopyButton'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { TurnOutcomeAnnouncement } from '@/components/chat-thread/ChatTurnChrome'
import {
  answerText,
  foldKeepsVisible,
  turnFold,
  type ChatTurnFold
} from '@/components/chat-thread/chat-turn-layout'
import { useChatEngineTurn } from '@/components/chat-thread/use-chat-engine-thread'
import { ChatDaySeparator, startsNewDay } from './ChatDaySeparator'
import {
  CHAT_MESSAGE_ACTION_CLASS,
  ChatMessageTray,
  ChatReplyAction,
  ChatRetryAction
} from './ChatMessageTray'
import { quoteExcerpt } from './chat-composer-quote'
import { ChatProcessItems } from './ChatProcessItems'
import { ChatTurnFoldPill } from './ChatProcessPills'
import { ChatReplyBubble } from './ChatReplyBubble'
import { ChatUserBubble } from './ChatUserBubble'
import { ChatTurnFailure, ChatTurnStopped } from './ChatTurnNotice'
import { ChatTurnPresence } from './ChatTurnPresence'
import { turnIsAnswering } from './chat-turn-phrases'

type ItemOf<K extends ChatEngineItem['kind']> = Extract<ChatEngineItem, { kind: K }>

export type ChatConversationSegment =
  | { kind: 'reply'; item: ItemOf<'text'> }
  | { kind: 'steer'; item: ItemOf<'steer'> }
  | { kind: 'process'; id: string; items: ChatEngineItem[] }

/** Replies and steers are messages; everything between them is one run of process rows. */
export function conversationSegments(items: ChatEngineItem[]): ChatConversationSegment[] {
  const segments: ChatConversationSegment[] = []
  for (const item of items) {
    if (item.kind === 'text') {
      segments.push({ kind: 'reply', item })
    } else if (item.kind === 'steer') {
      segments.push({ kind: 'steer', item })
    } else {
      const last = segments.at(-1)
      if (last?.kind === 'process') {
        last.items.push(item)
      } else {
        segments.push({ kind: 'process', id: item.id, items: [item] })
      }
    }
  }
  return segments
}

function ConversationItems(props: {
  items: ChatEngineItem[]
  /** Actions for the turn's answer, beside its last reply. */
  tray?: React.ReactNode
}): React.JSX.Element {
  const segments = conversationSegments(props.items)
  const lastReply = segments.findLastIndex((segment) => segment.kind === 'reply')
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'reply' ? (
          <ChatReplyBubble
            key={segment.item.id}
            text={segment.item.text}
            streaming={segment.item.streaming}
            tray={index === lastReply ? props.tray : undefined}
          />
        ) : segment.kind === 'steer' ? (
          <ChatUserBubble
            key={segment.item.id}
            text={segment.item.text}
            imageCount={segment.item.imageCount}
            note={
              segment.item.delivered
                ? undefined
                : translate('components.chat-thread.steerPending', 'Sending')
            }
          />
        ) : (
          <ChatProcessItems key={segment.id} items={segment.items} />
        )
      )}
    </>
  )
}

/** Done turns fold; stopped and failed ones get the same header but start open to show what happened. */
function settledFold(turn: ChatEngineTurn): ChatTurnFold | null {
  if (turn.status === 'interrupted' || turn.status === 'error') {
    return turnFold({ ...turn, status: 'done' })
  }
  return turnFold(turn)
}

const turnAt = (turn: ChatEngineTurn): number => turn.user?.sentAt ?? turn.startedAt

/** Subscribes to its own turn (and the one before, for the day line), so streaming elsewhere skips it. */
export const ChatConversationTurn = memo(function ChatConversationTurn(props: {
  threadId: string
  turnId: string
  previousTurnId: string | null
  latest: boolean
}): React.JSX.Element | null {
  const turn = useChatEngineTurn(props.threadId, props.turnId)
  const previous = useChatEngineTurn(props.threadId, props.previousTurnId ?? '')
  const { onRetry, onQuote } = useChatThreadContext()
  // null until toggled, so the default follows the outcome.
  const [processOpen, setProcessOpen] = useState<boolean | null>(null)
  if (!turn) {
    return null
  }
  const fold = settledFold(turn)
  const open = processOpen ?? turn.status !== 'done'
  const answer = turn.status === 'running' ? '' : answerText(fold ? fold.answer : turn.items)
  const user = turn.user
  // Only the latest: retrying an old turn would answer out of order.
  const retry =
    onRetry && props.latest && user && turn.status !== 'running'
      ? () => onRetry(unwrapChatWorkspaceUserTurn(user.text))
      : undefined
  const tray =
    answer || retry ? (
      <ChatMessageTray>
        {answer && <NativeChatCopyButton text={answer} className={CHAT_MESSAGE_ACTION_CLASS} />}
        {answer && onQuote && <ChatReplyAction onReply={() => onQuote(quoteExcerpt(answer))} />}
        {retry && turn.status !== 'error' && <ChatRetryAction onRetry={retry} />}
      </ChatMessageTray>
    ) : undefined
  const at = turnAt(turn)
  return (
    <section
      data-turn-id={turn.id}
      className="flex flex-col gap-3"
      aria-label={user ? unwrapChatWorkspaceUserTurn(user.text).slice(0, 80) : undefined}
    >
      {startsNewDay(previous ? turnAt(previous) : null, at) && <ChatDaySeparator at={at} />}
      {user && <ChatUserBubble text={user.text} imageCount={user.imageCount} />}
      {fold ? (
        <>
          <ChatTurnFoldPill turn={turn} open={open} onOpenChange={setProcessOpen}>
            <ConversationItems items={fold.process} />
          </ChatTurnFoldPill>
          {/* Closed hides the steps only; earlier replies stay readable. */}
          {!open && <ConversationItems items={fold.process.filter(foldKeepsVisible)} />}
          <ConversationItems items={fold.answer} tray={tray} />
        </>
      ) : (
        <ConversationItems items={turn.items} tray={tray} />
      )}
      {turn.status === 'running' && !turnIsAnswering(turn) && <ChatTurnPresence turn={turn} />}
      {turn.status === 'interrupted' && !fold && <ChatTurnStopped />}
      {turn.status === 'error' && <ChatTurnFailure message={turn.errorMessage} onRetry={retry} />}
      {props.latest && <TurnOutcomeAnnouncement turn={turn} />}
    </section>
  )
})
