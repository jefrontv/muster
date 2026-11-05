// Ported from the muster-bots fork (src/components/ToolActivity.tsx), Apache-2.0.
// One tool call as a card: status, verb and object in the header, Muster's tool body inside.

import { useId, useState } from 'react'
import type React from 'react'
import { Check, ChevronRight, Circle, CircleDot, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import { toolRowModel } from '@/components/chat-thread/chat-tool-row-model'
import { chatToolRenderer } from '@/components/chat-thread/chat-tool-registry'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { toolIsLive } from '@/components/chat-thread/chat-turn-layout'
import { CHAT_TOOL_ICONS } from '@/components/chat-thread/ChatToolRow'
import { CONTROL_HOVER } from '@/components/ui/hover-fill-classes'

const STATUS_LABEL: Partial<Record<ChatToolItem['status'], () => string>> = {
  'awaiting-approval': () => translate('components.chat-thread.awaitingApproval', 'Needs approval'),
  denied: () => translate('components.chat-thread.denied', 'Denied'),
  interrupted: () => translate('components.chat-thread.interrupted', 'Interrupted')
}

function StatusIcon({ item, failed }: { item: ChatToolItem; failed: boolean }): React.JSX.Element {
  if (toolIsLive(item)) {
    return <AgentWorkingSpinner className="size-3.5 text-chat-ink-secondary" />
  }
  if (failed) {
    return <X className="size-3.5 text-destructive" aria-hidden />
  }
  if (item.status === 'awaiting-approval') {
    return <CircleDot className="size-3.5 text-status-attention" aria-hidden />
  }
  if (item.status === 'done') {
    return <Check className="size-3.5 text-status-success" aria-hidden />
  }
  return <Circle className="size-3.5" aria-hidden />
}

export function ChatToolCard({ item }: { item: ChatToolItem }): React.JSX.Element {
  const { cwd } = useChatThreadContext()
  const renderer = chatToolRenderer(item.name)
  const [open, setOpen] = useState<boolean | null>(null)
  const bodyId = useId()
  const row = toolRowModel(item, cwd)
  // Follows the default until the user picks, so an error that lands later still opens.
  const isOpen = open ?? renderer.openByDefault(item)
  const live = toolIsLive(item)
  const Icon = CHAT_TOOL_ICONS[row.icon]
  const status = STATUS_LABEL[item.status]?.()
  const summary = row.errorSummary ?? row.object
  return (
    <div
      data-chat-tool-card=""
      className={cn(
        'w-fit min-w-0 max-w-full overflow-hidden rounded-xl border border-chat-line-2 bg-sidebar text-[13px]',
        isOpen && 'w-[min(38rem,100%)]'
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? bodyId : undefined}
        aria-busy={live || undefined}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          'flex min-h-8 w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100 ease-chat focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chat-accent motion-reduce:transition-none',
          CONTROL_HOVER,
          row.isError ? 'text-destructive' : 'text-chat-ink-secondary'
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <StatusIcon item={item} failed={row.isError} />
        </span>
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className={cn('flex min-w-0 items-center gap-1.5 leading-5', live && 'chat-shimmer')}>
          <span className="shrink-0 font-medium">{row.verb}</span>
          {summary && <span className="min-w-0 max-w-[30rem] truncate">{summary}</span>}
        </span>
        {row.additions !== undefined && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-chat-diff-added">
            +{row.additions}
          </span>
        )}
        {row.deletions !== undefined && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-chat-diff-deleted">
            -{row.deletions}
          </span>
        )}
        {row.meta.map((fact) => (
          <span key={fact} className="shrink-0 tabular-nums text-chat-ink-tertiary">
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
              item.status === 'awaiting-approval'
                ? 'text-status-attention'
                : 'text-chat-ink-tertiary'
            )}
          >
            {status}
          </span>
        )}
        <ChevronRight
          className={cn(
            'ml-auto size-3.5 shrink-0 transition-transform duration-100 ease-chat motion-reduce:transition-none',
            isOpen && 'rotate-90'
          )}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div id={bodyId} className="border-t border-chat-line-2 bg-background">
          <renderer.Body item={item} />
        </div>
      )}
    </div>
  )
}
