// A turn's notices and how it ended when it did not finish: stopped, or failed with Try again.

import type React from 'react'
import { CircleAlert, CircleStop, Info, RotateCcw, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { ChatPill } from './ChatPill'

type NoticeItem = Extract<ChatEngineItem, { kind: 'notice' }>

const NOTICE_ICON = { info: Info, warning: TriangleAlert, error: CircleAlert } as const

function NoticeLine(props: {
  level: NoticeItem['level'] | 'stopped'
  children: React.ReactNode
}): React.JSX.Element {
  const Icon = props.level === 'stopped' ? CircleStop : NOTICE_ICON[props.level]
  return (
    <div
      role={props.level === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 text-[13px] leading-5',
        props.level === 'error'
          ? 'text-destructive'
          : props.level === 'warning'
            ? 'text-status-attention'
            : 'text-chat-ink-tertiary'
      )}
    >
      <Icon className="mt-[3px] size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{props.children}</span>
    </div>
  )
}

export function ChatNotice({ item }: { item: NoticeItem }): React.JSX.Element {
  return <NoticeLine level={item.level}>{item.text}</NoticeLine>
}

export function ChatTurnStopped(): React.JSX.Element {
  return (
    <NoticeLine level="stopped">
      {translate('components.chat-thread.turnInterrupted', 'Stopped')}
    </NoticeLine>
  )
}

export function ChatTurnFailure(props: {
  message: string | null
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-2">
      <NoticeLine level="error">
        <span className="font-medium">
          {props.message ??
            translate('components.chat-thread.turnFailed', 'Claude stopped with an error.')}
        </span>
      </NoticeLine>
      {props.onRetry && (
        <ChatPill onClick={props.onRetry}>
          <RotateCcw className="size-3.5" aria-hidden />
          {translate('components.chat-thread.retry', 'Try again')}
        </ChatPill>
      )}
    </div>
  )
}
