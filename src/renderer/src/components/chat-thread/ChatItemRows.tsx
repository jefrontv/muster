import { memo, useState } from 'react'
import type React from 'react'
import { Bot, Brain, CircleAlert, Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { ChatDisclosureRow } from './ChatDisclosureRow'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatRowBoundary } from './ChatRowBoundary'
import { ChatToolRow } from './ChatToolRow'

type ItemOf<K extends ChatEngineItem['kind']> = Extract<ChatEngineItem, { kind: K }>

function Disclosure(props: {
  icon: React.ReactNode
  label: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <ChatDisclosureRow
      icon={props.icon}
      label={<span className="min-w-0 truncate">{props.label}</span>}
      open={open}
      onOpenChange={setOpen}
    >
      {props.children}
    </ChatDisclosureRow>
  )
}

function TextRow({ item }: { item: ItemOf<'text'> }): React.JSX.Element {
  return <ChatMarkdown text={item.text} streaming={item.streaming} />
}

function ThinkingRow({ item }: { item: ItemOf<'thinking'> }): React.JSX.Element {
  const icon = item.streaming ? (
    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
  ) : (
    <Brain className="size-3.5" aria-hidden />
  )
  const label = item.streaming
    ? translate('components.chat-thread.thinking', 'Thinking')
    : translate('components.chat-thread.thought', 'Thought')
  return (
    <Disclosure icon={icon} label={label}>
      <div className="whitespace-pre-wrap text-[13px] text-muted-foreground">{item.text}</div>
    </Disclosure>
  )
}

function AgentRow({ item }: { item: ItemOf<'agent'> }): React.JSX.Element {
  const icon =
    item.status === 'running' ? (
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
    ) : (
      <Bot className={cn('size-3.5', item.status === 'error' && 'text-destructive')} aria-hidden />
    )
  return (
    <Disclosure icon={icon} label={item.description || item.subagentType || 'Agent'}>
      <ChatItemList items={item.items} />
      {item.summary && <div className="pt-1 text-[13px] text-muted-foreground">{item.summary}</div>}
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
        item.level === 'error' ? 'text-destructive' : 'text-muted-foreground'
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
      <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
        {item.text}
        {!item.delivered && (
          <div className="pt-1 text-xs text-muted-foreground">
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

export function ChatItemList({ items }: { items: ChatEngineItem[] }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {items.map((item) => (
        <ChatItemRow key={item.id} item={item} />
      ))}
    </div>
  )
}
