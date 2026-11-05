// A run of process items in Chat mode: tool cards, run pills, thinking, subagents and notices.

import { useState } from 'react'
import type React from 'react'
import { Bot, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { ChatMarkdown } from '@/components/chat-thread/ChatMarkdown'
import { ChatRowBoundary } from '@/components/chat-thread/ChatRowBoundary'
import { chatProcessBlocks, type ChatProcessBlock } from './chat-activity-runs'
import { ChatActivityRun, ChatDisclosurePill, ChatThinkingPill } from './ChatProcessPills'
import { ChatToolCard } from './ChatToolCard'
import { ChatNotice } from './ChatTurnNotice'
import { agentSummary } from './chat-subagent-focus'

type AgentItem = Extract<ChatEngineItem, { kind: 'agent' }>

/** A subagent is a run of its own: one pill, opening to its steps and summary. */
function ChatAgentRun({ item }: { item: AgentItem }): React.JSX.Element {
  // Opens itself while it works, so its live steps are in view.
  const [open, setOpen] = useState<boolean | null>(null)
  const isOpen = open ?? item.status === 'running'
  const summary = agentSummary(item)
  const { openAgent } = useChatThreadContext()
  const label = translate('components.chat-conversation.focus.open', 'Open agent')
  return (
    <div data-agent-run={item.id} className="flex min-w-0 flex-col items-start">
      <ChatDisclosurePill
        live={item.status === 'running'}
        action={
          openAgent && (
            <button
              type="button"
              onClick={() => openAgent(item.id)}
              aria-label={label}
              title={label}
              className="grid size-7 shrink-0 place-items-center rounded-full text-chat-ink-tertiary opacity-0 transition-[opacity,color,background-color] duration-100 ease-chat group-hover/pill:opacity-100 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent motion-reduce:transition-none"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
          )
        }
        icon={
          <Bot
            className={cn('size-3.5', item.status === 'error' && 'text-destructive')}
            aria-hidden
          />
        }
        label={item.description || item.subagentType || 'Agent'}
        open={isOpen}
        onOpenChange={setOpen}
      >
        <div className="ml-[7px] flex w-full min-w-0 flex-col gap-1.5 border-l border-chat-line-2 pl-3">
          <ChatProcessItems items={item.items} />
          {summary && <div className="text-[13px] text-chat-ink-tertiary">{summary}</div>}
        </div>
      </ChatDisclosurePill>
    </div>
  )
}

function blockKey(block: ChatProcessBlock): string {
  return block.kind === 'run' ? `run:${block.id}` : block.item.id
}

function Block({ block }: { block: ChatProcessBlock }): React.JSX.Element {
  switch (block.kind) {
    case 'run':
      return <ChatActivityRun items={block.items} />
    case 'tool':
      return <ChatToolCard item={block.item} />
    case 'thinking':
      return <ChatThinkingPill item={block.item} />
    case 'agent':
      return <ChatAgentRun item={block.item} />
    case 'notice':
      return <ChatNotice item={block.item} />
    case 'message':
      // Only inside a subagent: its narration between steps.
      return (
        <ChatMarkdown
          text={block.item.text}
          streaming={block.item.kind === 'text' && block.item.streaming}
          density="compact"
        />
      )
  }
}

export function ChatProcessItems({ items }: { items: ChatEngineItem[] }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {chatProcessBlocks(items).map((block) =>
        block.kind === 'run' ? (
          <Block key={blockKey(block)} block={block} />
        ) : (
          <ChatRowBoundary key={blockKey(block)} rowId={block.item.id} item={block.item}>
            <Block block={block} />
          </ChatRowBoundary>
        )
      )}
    </div>
  )
}
