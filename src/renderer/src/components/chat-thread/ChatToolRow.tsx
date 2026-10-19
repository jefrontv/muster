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
  // Counts stay quiet until the row is engaged.
  const count = 'shrink-0 font-mono text-[11px] tabular-nums'
  return (
    <ChatDisclosureRow
      live={live}
      icon={<Icon className={cn('size-3.5', row.isError && 'text-destructive')} aria-hidden />}
      label={
        <>
          <span className="shrink-0">{row.verb}</span>
          {row.object && (
            <>
              <ChatRowDot />
              <span
                className={cn(
                  'min-w-0 truncate',
                  !row.plainObject &&
                    'font-mono text-xs underline decoration-dotted decoration-from-font underline-offset-2'
                )}
              >
                {row.object}
              </span>
            </>
          )}
          {row.additions !== undefined && (
            <span
              className={cn(
                count,
                isOpen
                  ? 'text-[var(--git-decoration-added)]'
                  : 'group-hover/row:text-[var(--git-decoration-added)]'
              )}
            >
              +{row.additions}
            </span>
          )}
          {row.deletions !== undefined && (
            <span
              className={cn(
                count,
                isOpen
                  ? 'text-[var(--git-decoration-deleted)]'
                  : 'group-hover/row:text-[var(--git-decoration-deleted)]'
              )}
            >
              -{row.deletions}
            </span>
          )}
          {row.meta.map((fact) => (
            <span key={fact} className="shrink-0 tabular-nums">
              {fact}
            </span>
          ))}
          {row.exit && !row.exit.ok && (
            <span className="shrink-0 text-destructive">{row.exit.label}</span>
          )}
          {status && (
            <span
              className={cn(
                'shrink-0',
                item.status === 'awaiting-approval' && 'text-status-attention'
              )}
            >
              {status}
            </span>
          )}
        </>
      }
      open={isOpen}
      onOpenChange={setOpen}
    >
      <renderer.Body item={item} />
    </ChatDisclosureRow>
  )
}
