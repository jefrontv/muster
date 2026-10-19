import { memo, useState } from 'react'
import type React from 'react'
import { Bot, Brain, CircleAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { chatItemBlocks, type ChatItemRun } from './chat-turn-layout'
import { ChatDisclosureRow, ChatRowDot } from './ChatDisclosureRow'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatProcessStack } from './ChatProcessStack'
import { ChatRowBoundary } from './ChatRowBoundary'
import { ChatToolGroupRow } from './ChatToolGroupRow'
import { ChatToolRow } from './ChatToolRow'
import { reasoningPreview } from './chat-reasoning-preview'

type ItemOf<K extends ChatEngineItem['kind']> = Extract<ChatEngineItem, { kind: K }>

function Disclosure(props: {
  icon: React.ReactNode
  label: React.ReactNode
  live?: boolean
  bodyClassName?: string
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <ChatDisclosureRow
      icon={props.icon}
      label={props.label}
      live={props.live}
      open={open}
      onOpenChange={setOpen}
      bodyClassName={props.bodyClassName}
    >
      {props.children}
    </ChatDisclosureRow>
  )
}

function TextRow({ item }: { item: ItemOf<'text'> }): React.JSX.Element {
  return <ChatMarkdown text={item.text} streaming={item.streaming} />
}

function ThinkingRow({ item }: { item: ItemOf<'thinking'> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = reasoningPreview(item.text, item.streaming)
  return (
    <ChatDisclosureRow
      live={item.streaming}
      open={open}
      onOpenChange={setOpen}
      // Pinned while open so a long reasoning body can always be folded.
      headerClassName={open ? 'sticky top-0 z-[6] bg-background' : undefined}
      icon={<Brain className="size-3.5" aria-hidden />}
      label={
        <>
          <span className="shrink-0">
            {item.streaming
              ? translate('components.chat-thread.thinking', 'Thinking')
              : translate('components.chat-thread.thought', 'Thought')}
          </span>
          {summary && !open && (
            <>
              <ChatRowDot />
              <span
                className={cn(
                  'min-w-0 overflow-hidden whitespace-nowrap',
                  // New words arrive into a soft trailing edge instead of an ellipsis.
                  item.streaming
                    ? '[mask-image:linear-gradient(to_right,#000_calc(100%-48px),transparent)]'
                    : 'text-ellipsis'
                )}
              >
                {summary}
              </span>
            </>
          )}
        </>
      }
    >
      <ChatMarkdown text={item.text} streaming={item.streaming} density="compact" />
    </ChatDisclosureRow>
  )
}

function AgentRow({ item }: { item: ItemOf<'agent'> }): React.JSX.Element {
  return (
    <Disclosure
      live={item.status === 'running'}
      icon={
        <Bot
          className={cn('size-3.5', item.status === 'error' && 'text-destructive')}
          aria-hidden
        />
      }
      label={
        <span className="min-w-0 truncate">{item.description || item.subagentType || 'Agent'}</span>
      }
      bodyClassName="ml-[7px] border-l-[0.5px] border-chat-line-2 pl-[15px]"
    >
      <ChatItemList items={item.items} />
      {item.summary && (
        <div className="pt-1 text-[13px] text-chat-ink-tertiary">{item.summary}</div>
      )}
    </Disclosure>
  )
}

function NoticeRow({ item }: { item: ItemOf<'notice'> }): React.JSX.Element {
  const Icon = item.level === 'info' ? Info : CircleAlert
  return (
    <div
      role={item.level === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 text-[13px]',
        item.level === 'error' ? 'text-destructive' : 'text-chat-ink-tertiary'
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{item.text}</span>
    </div>
  )
}

function SteerRow({ item }: { item: ItemOf<'steer'> }): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70.2%] whitespace-pre-wrap break-words rounded-chat-bubble bg-chat-bubble px-4 py-2.5 text-sm leading-[22px] text-foreground">
        {item.text}
        {!item.delivered && (
          <div className="pt-1 text-xs text-chat-ink-tertiary">
            {translate('components.chat-thread.steerPending', 'Sending')}
          </div>
        )}
      </div>
    </div>
  )
}

// Row registry by item kind; every kind must have a renderer.
const ROW_RENDERERS: { [K in ChatEngineItem['kind']]: React.ComponentType<{ item: ItemOf<K> }> } = {
  text: TextRow,
  thinking: ThinkingRow,
  tool: ChatToolRow,
  agent: AgentRow,
  notice: NoticeRow,
  steer: SteerRow
}

/** Memoized on the item object: the store keeps it identical until it changes. */
export const ChatItemRow = memo(function ChatItemRow({ item }: { item: ChatEngineItem }) {
  const Row = ROW_RENDERERS[item.kind] as React.ComponentType<{ item: ChatEngineItem }>
  return (
    <ChatRowBoundary rowId={item.id} item={item}>
      <Row item={item} />
    </ChatRowBoundary>
  )
})

const runKey = (run: ChatItemRun): string => (run.kind === 'group' ? run.id : run.item.id)

function renderRun(run: ChatItemRun): React.ReactNode {
  return run.kind === 'group' ? (
    <ChatToolGroupRow key={run.id} items={run.items} />
  ) : (
    <ChatItemRow key={run.item.id} item={run.item} />
  )
}

export function ChatItemList({ items }: { items: ChatEngineItem[] }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {chatItemBlocks(items).map((block) =>
        block.kind === 'stack' ? (
          <ChatProcessStack
            key={block.id}
            runs={block.runs}
            runKey={runKey}
            renderRun={renderRun}
          />
        ) : (
          renderRun(block.run)
        )
      )}
    </div>
  )
}
