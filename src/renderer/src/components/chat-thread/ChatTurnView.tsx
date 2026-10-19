import { memo } from 'react'
import type React from 'react'
import { CircleAlert, Image as ImageIcon } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { ChatItemList } from './ChatItemRows'
import { formatElapsed } from './chat-tool-row-model'
import { useChatEngineTurn } from './use-chat-engine-thread'

function UserMessage({ user }: { user: NonNullable<ChatEngineTurn['user']> }): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
        {/* The first send carries the workspace brief ahead of what the user typed. */}
        {unwrapChatWorkspaceUserTurn(user.text)}
        {user.imageCount > 0 && (
          <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
            <ImageIcon className="size-3" aria-hidden />
            {user.imageCount === 1
              ? translate('components.chat-thread.imageOne', '1 image')
              : translate('components.chat-thread.imageMany', '{{count}} images', {
                  count: user.imageCount
                })}
          </div>
        )}
      </div>
    </div>
  )
}

function TurnEnd({ turn }: { turn: ChatEngineTurn }): React.JSX.Element | null {
  if (turn.status === 'error') {
    return (
      <div role="alert" className="flex items-start gap-2 text-[13px] text-destructive">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {turn.errorMessage ??
            translate('components.chat-thread.turnFailed', 'Claude stopped with an error.')}
        </span>
      </div>
    )
  }
  if (turn.status === 'interrupted') {
    return (
      <div className="text-[13px] text-muted-foreground">
        {translate('components.chat-thread.turnInterrupted', 'Stopped')}
      </div>
    )
  }
  if (turn.status === 'done' && turn.durationMs) {
    return (
      <div className="text-[13px] tabular-nums text-muted-foreground">
        {translate('components.chat-thread.workedFor', 'Worked for {{duration}}', {
          duration: formatElapsed(turn.durationMs / 1000)
        })}
      </div>
    )
  }
  return null
}

/** Subscribes to its own turn, so another turn streaming never re-renders it. */
export const ChatTurnView = memo(function ChatTurnView(props: {
  threadId: string
  turnId: string
}): React.JSX.Element | null {
  const turn = useChatEngineTurn(props.threadId, props.turnId)
  if (!turn) {
    return null
  }
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={turn.user ? unwrapChatWorkspaceUserTurn(turn.user.text).slice(0, 80) : undefined}
    >
      {turn.user && <UserMessage user={turn.user} />}
      <ChatItemList items={turn.items} />
      <TurnEnd turn={turn} />
    </section>
  )
})
