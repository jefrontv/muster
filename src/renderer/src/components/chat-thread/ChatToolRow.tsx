import { useState } from 'react'
import type React from 'react'
import {
  ClipboardList,
  FilePlus,
  FileText,
  Globe,
  ListTodo,
  MessageCircleQuestion,
  Pencil,
  Plug,
  Search,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatToolItem } from './chat-tool-input'
import { toolRowModel, type ChatToolIconKey } from './chat-tool-row-model'
import { chatToolRenderer } from './chat-tool-registry'
import { useChatThreadContext } from './chat-thread-context'
import { ChatDisclosureRow, ChatRowDot } from './ChatDisclosureRow'
import { toolIsLive } from './chat-turn-layout'

const ICONS: Record<ChatToolIconKey, LucideIcon> = {
  file: FileText,
  pen: Pencil,
  plus: FilePlus,
  terminal: Terminal,
  search: Search,
  globe: Globe,
  plug: Plug,
  question: MessageCircleQuestion,
  plan: ClipboardList,
  list: ListTodo,
  sparkles: Sparkles,
  tool: Wrench
}

const STATUS_LABEL: Partial<Record<ChatToolItem['status'], () => string>> = {
  'awaiting-approval': () => translate('components.chat-thread.awaitingApproval', 'Needs approval'),
  denied: () => translate('components.chat-thread.denied', 'Denied'),
  interrupted: () => translate('components.chat-thread.interrupted', 'Interrupted')
}

export function ChatToolRow({ item }: { item: ChatToolItem }): React.JSX.Element {
  const { cwd } = useChatThreadContext()
  const renderer = chatToolRenderer(item.name)
  const [open, setOpen] = useState<boolean | null>(null)
  const row = toolRowModel(item, cwd)
  // Follows the default until the user picks, so an error that lands later still opens.
  const isOpen = open ?? renderer.openByDefault(item)
  const live = toolIsLive(item)
  const Icon = ICONS[row.icon]
  const status = STATUS_LABEL[item.status]?.()
  const summary = row.errorSummary ?? row.object
  // Counts stay quiet until the row is engaged.
  const count = 'ml-2.5 shrink-0 font-mono text-[11px] tabular-nums'
  return (
    <ChatDisclosureRow
      live={live}
      icon={<Icon className={cn('size-3.5', row.isError && 'text-destructive')} aria-hidden />}
      label={
        <>
          <span className="shrink-0">{row.verb}</span>
          {summary && (
            <>
              <ChatRowDot />
              <span
                className={cn(
                  'min-w-0 truncate',
                  row.isError && 'text-destructive',
                  !row.plainObject &&
                    !row.errorSummary &&
                    'underline decoration-dotted decoration-1 underline-offset-3'
                )}
              >
                {summary}
              </span>
            </>
          )}
          {row.additions !== undefined && (
            <span
              className={cn(
                count,
                isOpen ? 'text-chat-diff-added' : 'group-hover/row:text-chat-diff-added'
              )}
            >
              +{row.additions}
            </span>
          )}
          {row.deletions !== undefined && (
            <span
              className={cn(
                count,
                row.additions !== undefined && 'ml-1.5',
                isOpen ? 'text-chat-diff-deleted' : 'group-hover/row:text-chat-diff-deleted'
              )}
            >
              -{row.deletions}
            </span>
          )}
          {row.meta.map((fact) => (
            <span key={fact} className="ml-2 shrink-0 tabular-nums">
              {fact}
            </span>
          ))}
          {row.exit && !row.exit.ok && (
            <span className="ml-2 flex shrink-0 items-center gap-[5px] text-destructive">
              <span className="size-1 shrink-0 rounded-full bg-destructive" aria-hidden />
              {row.exit.label}
            </span>
          )}
          {status && (
            <span
              className={cn(
                'ml-2 shrink-0',
                item.status === 'awaiting-approval' && 'text-status-attention'
              )}
            >
              {status}
            </span>
          )}
        </>
      }
      bodyClassName="p-0"
      open={isOpen}
      onOpenChange={setOpen}
    >
      <renderer.Body item={item} />
    </ChatDisclosureRow>
  )
}
