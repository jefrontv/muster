// One row of a turn's work log: icon, verb, object, trailing meta. Collapsed by
// default; in Code mode a row with a typed detail expands in place. Chat mode
// rows are sentences and never expand.

import { useState } from 'react'
import {
  Bot,
  ChevronRight,
  File,
  FilePlus,
  Globe,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  Plug,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatActivityIcon } from '../../../../shared/native-chat-tool-activity-types'
import type { NativeChatWorkEntry, NativeChatWorkToolEntry } from './native-chat-turn-work'
import { NativeChatWorkDetail } from './NativeChatWorkDetail'
import { useNativeChatSurface } from './native-chat-surface-context'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'

const ICONS: Record<NativeChatActivityIcon, LucideIcon> = {
  pen: Pencil,
  'file-plus': FilePlus,
  terminal: SquareTerminal,
  file: File,
  search: Search,
  globe: Globe,
  bot: Bot,
  plug: Plug,
  question: MessageCircleQuestion,
  sparkles: Sparkles,
  tool: Wrench
}

const ROW_CLASS =
  'group flex w-full min-w-0 items-center gap-2 rounded-sm py-0.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function NativeChatLineCounts({
  additions,
  deletions
}: {
  additions?: number
  deletions?: number
}): React.JSX.Element | null {
  if (!additions && !deletions) {
    return null
  }
  return (
    <span className="shrink-0 tabular-nums">
      {additions ? <span className="text-[var(--git-decoration-added)]">+{additions}</span> : null}
      {additions && deletions ? ' ' : null}
      {deletions ? (
        <span className="text-[var(--git-decoration-deleted)]">−{deletions}</span>
      ) : null}
    </span>
  )
}

function Disclosure({
  label,
  icon,
  expandable,
  children,
  meta
}: {
  label: React.ReactNode
  icon: React.ReactNode
  expandable: boolean
  children?: React.ReactNode
  meta?: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(open)
  const head = (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">{label}</span>
      {meta}
      {expandable ? (
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open ? 'rotate-90' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          )}
        />
      ) : null}
    </>
  )
  return (
    <div ref={elementRef}>
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          className={cn(ROW_CLASS, 'cursor-pointer')}
          onClick={() => {
            captureBeforeToggle()
            setOpen((value) => !value)
          }}
        >
          {head}
        </button>
      ) : (
        <div className={ROW_CLASS}>{head}</div>
      )}
      {expandable && open ? <div className="py-1.5 pl-5">{children}</div> : null}
    </div>
  )
}

function ToolRow({ entry }: { entry: NativeChatWorkToolEntry }): React.JSX.Element {
  const { surface } = useNativeChatSurface()
  const { activity } = entry
  const Icon = ICONS[activity.icon]
  const expandable = surface === 'code' && activity.detail !== 'none'
  return (
    <Disclosure
      expandable={expandable}
      icon={
        entry.running ? (
          <Loader2 className="size-3 motion-safe:animate-spin" aria-label="Running" />
        ) : (
          <Icon className="size-3.5" />
        )
      }
      label={
        <>
          <span className="shrink-0 text-foreground/85">{activity.verb}</span>
          {activity.object ? (
            <span
              className={cn(
                'min-w-0 truncate text-muted-foreground',
                activity.objectIsCode && 'font-mono text-[11px]'
              )}
              title={activity.object}
            >
              {activity.object}
            </span>
          ) : null}
        </>
      }
      meta={
        <>
          <NativeChatLineCounts additions={activity.additions} deletions={activity.deletions} />
          {activity.meta.map((item) => (
            <span
              key={item}
              className={cn(
                'shrink-0 text-muted-foreground/80 tabular-nums',
                activity.failed && item === activity.meta.at(-1) && 'text-destructive'
              )}
            >
              {item}
            </span>
          ))}
        </>
      }
    >
      <NativeChatWorkDetail entry={entry} />
    </Disclosure>
  )
}

export function NativeChatWorkRow({ entry }: { entry: NativeChatWorkEntry }): React.JSX.Element {
  const { surface } = useNativeChatSurface()
  if (entry.kind === 'tool') {
    return <ToolRow entry={entry} />
  }
  if (entry.kind === 'thinking') {
    return (
      <Disclosure
        expandable
        icon={<Lightbulb className="size-3.5" />}
        label={
          <span className="text-foreground/85">
            {translate('components.native-chat.activity.thought', 'Thought')}
          </span>
        }
      >
        <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">{entry.text}</p>
      </Disclosure>
    )
  }
  return (
    <Disclosure
      expandable={surface === 'code'}
      icon={<Search className="size-3.5" />}
      label={<span className="text-foreground/85">{entry.label}</span>}
    >
      <div className="space-y-0.5">
        {entry.entries.map((child) => (
          <ToolRow key={child.key} entry={child} />
        ))}
      </div>
    </Disclosure>
  )
}
