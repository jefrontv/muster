import { memo, useState } from 'react'
import type React from 'react'
import { FileText, Globe, Search, Terminal, Wrench, type LucideIcon } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ChatToolItem } from './chat-tool-input'
import { toolCategory, toolGroupSummary, type ChatToolCategory } from './chat-turn-layout'
import { ChatDisclosureRow, ChatRowDot } from './ChatDisclosureRow'
import { ChatRowBoundary } from './ChatRowBoundary'
import { ChatToolRow } from './ChatToolRow'

const ICONS: Record<ChatToolCategory, LucideIcon> = {
  read: FileText,
  search: Search,
  run: Terminal,
  web: Globe,
  other: Wrench
}

function categoryLabel(category: ChatToolCategory, live: boolean): string {
  switch (category) {
    case 'read':
      return live
        ? translate('components.chat-thread.group.reading', 'Reading files')
        : translate('components.chat-thread.group.read', 'Read files')
    case 'search':
      return live
        ? translate('components.chat-thread.group.searching', 'Searching code')
        : translate('components.chat-thread.group.searched', 'Searched code')
    case 'run':
      return live
        ? translate('components.chat-thread.group.running', 'Running commands')
        : translate('components.chat-thread.group.ran', 'Ran commands')
    case 'web':
      return live
        ? translate('components.chat-thread.group.browsing', 'Searching the web')
        : translate('components.chat-thread.group.browsed', 'Searched the web')
    case 'other':
      return live
        ? translate('components.chat-thread.group.using', 'Using tools')
        : translate('components.chat-thread.group.used', 'Used tools')
  }
}

function ChatToolGroupRowImpl({ items }: { items: ChatToolItem[] }): React.JSX.Element {
  const [open, setOpen] = useState<boolean | null>(null)
  const summary = toolGroupSummary(items)
  const isOpen = open ?? summary.needsAttention
  const last = items.at(-1)!
  const Icon = ICONS[toolCategory(last.name)]
  // Live, name what is happening now; settled, list everything the group did.
  const label = summary.live
    ? categoryLabel(toolCategory(last.name), true)
    : summary.categories.map((category) => categoryLabel(category, false)).join(', ')
  return (
    <ChatDisclosureRow
      live={summary.live}
      icon={<Icon className="size-3.5" aria-hidden />}
      label={
        <>
          <span className="min-w-0 truncate">{label}</span>
          <ChatRowDot />
          <span className="shrink-0 tabular-nums">
            {translate('components.chat-thread.group.steps', '{{count}} steps', {
              count: items.length
            })}
          </span>
        </>
      }
      open={isOpen}
      onOpenChange={setOpen}
      bodyClassName="scrollbar-sleek flex max-h-[min(400px,50vh)] flex-col gap-1.5 overflow-y-auto"
    >
      {items.map((item) => (
        <ChatRowBoundary key={item.id} rowId={item.id} item={item}>
          <ChatToolRow item={item} />
        </ChatRowBoundary>
      ))}
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
