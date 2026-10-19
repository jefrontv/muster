import { memo, useState } from 'react'
import type React from 'react'
import { FileText, Globe, Search, Terminal, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatToolItem } from './chat-tool-input'
import { toolCategory, toolGroupSummary, type ChatToolCategory } from './chat-turn-layout'
import { toolCategoryLabel, useHeldLiveLabel } from './chat-tool-group-label'
import { useScrollFades } from './chat-tool-group-scroll-fades'
import { ChatDisclosureRow } from './ChatDisclosureRow'
import { ChatRowBoundary } from './ChatRowBoundary'
import { ChatToolRow } from './ChatToolRow'

const ICONS: Record<ChatToolCategory, LucideIcon> = {
  read: FileText,
  search: Search,
  run: Terminal,
  web: Globe,
  other: Wrench
}

function ChatToolGroupBody({ items }: { items: ChatToolItem[] }): React.JSX.Element {
  const { scrollRef, contentRef, fades, onScroll } = useScrollFades()
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      data-fade-top={fades.top || undefined}
      data-fade-bottom={fades.bottom || undefined}
      className={cn(
        'scrollbar-sleek max-h-[min(400px,50vh)] overflow-y-auto [scrollbar-gutter:stable]',
        fades.top &&
          !fades.bottom &&
          '[mask-image:linear-gradient(to_bottom,transparent_0,#000_24px,#000_100%)]',
        fades.bottom &&
          !fades.top &&
          '[mask-image:linear-gradient(to_bottom,#000_0,#000_calc(100%_-_24px),transparent_100%)]',
        fades.top &&
          fades.bottom &&
          '[mask-image:linear-gradient(to_bottom,transparent_0,#000_24px,#000_calc(100%_-_24px),transparent_100%)]'
      )}
    >
      <div ref={contentRef} className="flex flex-col gap-1.5">
        {items.map((item) => (
          <ChatRowBoundary key={item.id} rowId={item.id} item={item}>
            <ChatToolRow item={item} />
          </ChatRowBoundary>
        ))}
      </div>
    </div>
  )
}

function ChatToolGroupRowImpl({ items }: { items: ChatToolItem[] }): React.JSX.Element {
  const [open, setOpen] = useState<boolean | null>(null)
  const summary = toolGroupSummary(items)
  const isOpen = open ?? summary.needsAttention
  const last = items.at(-1)!
  const Icon = ICONS[toolCategory(last.name)]
  // Live, name what is happening now; settled, list everything the group did.
  const desired = summary.live
    ? toolCategoryLabel(toolCategory(last.name), true)
    : summary.categories.map((category) => toolCategoryLabel(category, false)).join(', ')
  const label = useHeldLiveLabel(desired, summary.live)
  return (
    <ChatDisclosureRow
      live={summary.live}
      icon={<Icon className="size-3.5" aria-hidden />}
      label={<span className="min-w-0 truncate">{label}</span>}
      open={isOpen}
      onOpenChange={setOpen}
      headerClassName="text-[14px]"
      bodyClassName="pb-0 pl-0 pt-2"
    >
      <ChatToolGroupBody items={items} />
    </ChatDisclosureRow>
  )
}

/** The runs array is rebuilt every render; its members keep identity until they change. */
export const ChatToolGroupRow = memo(
  ChatToolGroupRowImpl,
  (prev, next) =>
    prev.items.length === next.items.length &&
    prev.items.every((item, index) => item === next.items[index])
)
