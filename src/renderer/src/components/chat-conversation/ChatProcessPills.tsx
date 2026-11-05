// Ported from the muster-bots fork (src/components/ActivityRun.tsx, TurnNarrationRun.tsx), Apache-2.0.
// The pills that fold a turn's process: a run of finished calls, a thinking block, the whole turn.

import { useId, useState } from 'react'
import type React from 'react'
import { Brain, Check, ChevronRight, CircleAlert, CircleStop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import { ChatMarkdown } from '@/components/chat-thread/ChatMarkdown'
import { reasoningPreview } from '@/components/chat-thread/chat-reasoning-preview'
import { describeRun, turnFoldLabel } from './chat-activity-runs'
import { ChatPill } from './ChatPill'
import { ChatToolCard } from './ChatToolCard'

/** A pill that opens what it summarises underneath it. */
export function ChatDisclosurePill(props: {
  icon: React.ReactNode
  label: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  live?: boolean
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  const bodyId = useId()
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <ChatPill
        aria-expanded={props.open}
        aria-controls={props.open ? bodyId : undefined}
        aria-busy={props.live || undefined}
        title={props.title}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <span className="flex shrink-0">{props.icon}</span>
        <span className={cn('min-w-0 max-w-[480px] truncate', props.live && 'chat-shimmer')}>
          {props.label}
        </span>
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-100 ease-chat motion-reduce:transition-none',
            props.open && 'rotate-90'
          )}
          aria-hidden
        />
      </ChatPill>
      {props.open && (
        <div id={bodyId} className="flex w-full min-w-0 flex-col items-start gap-1.5">
          {props.children}
        </div>
      )}
    </div>
  )
}

/** Finished calls in a row: "4 steps: Read ×2, Grep, Bash", opening to their cards. */
export function ChatActivityRun({ items }: { items: ChatToolItem[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <ChatDisclosurePill
      icon={<Check className="size-3.5 text-status-success" aria-hidden />}
      label={describeRun(items)}
      title={open ? undefined : translate('components.chat-conversation.showSteps', 'Show steps')}
      open={open}
      onOpenChange={setOpen}
    >
      {items.map((item) => (
        <ChatToolCard key={item.id} item={item} />
      ))}
    </ChatDisclosurePill>
  )
}

type ThinkingItem = Extract<ChatEngineItem, { kind: 'thinking' }>

export function ChatThinkingPill({ item }: { item: ThinkingItem }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const preview = item.streaming ? reasoningPreview(item.text, true) : ''
  return (
    <ChatDisclosurePill
      live={item.streaming}
      icon={<Brain className="size-3.5" aria-hidden />}
      label={
        item.streaming
          ? preview || translate('components.chat-thread.thinking', 'Thinking')
          : translate('components.chat-thread.thought', 'Thought')
      }
      open={open}
      onOpenChange={setOpen}
    >
      <div className="w-[min(38rem,100%)] rounded-xl border border-chat-line-2 bg-sidebar px-3 py-2">
        <ChatMarkdown text={item.text} streaming={item.streaming} density="compact" />
      </div>
    </ChatDisclosurePill>
  )
}

const FOLD_ICON: Record<'done' | 'interrupted' | 'error', React.JSX.Element> = {
  done: <Check className="size-3.5 text-status-success" aria-hidden />,
  interrupted: <CircleStop className="size-3.5" aria-hidden />,
  error: <CircleAlert className="size-3.5 text-destructive" aria-hidden />
}

/** A settled turn's steps behind "Worked for 29s"; the caller starts it open for stopped and failed turns. */
export function ChatTurnFoldPill(props: {
  turn: Pick<ChatEngineTurn, 'status' | 'durationMs'>
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  const status = props.turn.status === 'running' ? 'done' : props.turn.status
  return (
    <ChatDisclosurePill
      icon={FOLD_ICON[status]}
      label={turnFoldLabel(props.turn)}
      title={
        props.open
          ? translate('components.chat-conversation.hideSteps', 'Hide steps')
          : translate('components.chat-conversation.showSteps', 'Show steps')
      }
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      {props.children}
    </ChatDisclosurePill>
  )
}
