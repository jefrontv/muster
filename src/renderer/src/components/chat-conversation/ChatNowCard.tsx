// The presence line's card: the turn's last four steps, newest last, with how each is going.

import type React from 'react'
import { Bot, Check, Circle, CircleDot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { toolRowModel } from '@/components/chat-thread/chat-tool-row-model'

export const NOW_STEP_LIMIT = 4

type StepItem = Extract<ChatEngineItem, { kind: 'tool' } | { kind: 'agent' }>

export function nowSteps(items: ChatEngineItem[]): StepItem[] {
  return items
    .filter((item): item is StepItem => item.kind === 'tool' || item.kind === 'agent')
    .slice(-NOW_STEP_LIMIT)
}

type StepState = 'live' | 'done' | 'failed' | 'waiting' | 'idle'

function stepState(item: StepItem): StepState {
  if (item.kind === 'agent') {
    return item.status === 'running' ? 'live' : item.status === 'error' ? 'failed' : 'done'
  }
  switch (item.status) {
    case 'streaming':
    case 'running':
      return 'live'
    case 'done':
      return 'done'
    case 'error':
      return 'failed'
    case 'awaiting-approval':
      return 'waiting'
    default:
      return 'idle'
  }
}

const STATE_ICON: Record<StepState, React.ReactNode> = {
  live: <AgentWorkingSpinner className="size-3.5 text-chat-ink-secondary" />,
  done: <Check className="size-3.5 text-status-success" aria-hidden />,
  failed: <X className="size-3.5 text-destructive" aria-hidden />,
  waiting: <CircleDot className="size-3.5 text-status-attention" aria-hidden />,
  idle: <Circle className="size-3.5" aria-hidden />
}

function StepLabel({ item }: { item: StepItem }): React.JSX.Element {
  const { cwd } = useChatThreadContext()
  if (item.kind === 'agent') {
    return (
      <>
        <Bot className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">{item.description || item.subagentType || 'Agent'}</span>
      </>
    )
  }
  const row = toolRowModel(item, cwd)
  const summary = row.errorSummary ?? row.object
  return (
    <>
      <span className="shrink-0 font-medium">{row.verb}</span>
      {summary && <span className="min-w-0 truncate text-chat-ink-tertiary">{summary}</span>}
    </>
  )
}

export function ChatNowCard({ steps }: { steps: StepItem[] }): React.JSX.Element {
  return (
    <ol className="flex w-[min(28rem,100%)] flex-col gap-0.5 rounded-xl border border-chat-line-2 bg-sidebar p-1.5 text-[13px]">
      {steps.map((item) => {
        const state = stepState(item)
        return (
          <li
            key={item.id}
            className={cn(
              'flex min-h-7 min-w-0 items-center gap-2 rounded-lg px-2 text-chat-ink-secondary',
              state === 'live' && 'bg-foreground/[0.04]'
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {STATE_ICON[state]}
            </span>
            <StepLabel item={item} />
          </li>
        )
      })}
    </ol>
  )
}
