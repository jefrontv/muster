// The pane's live subagents and teammates, as a tab tucked under the composer.
// Background agents return their tool call at once, so the transcript alone
// would show them done; the hook roster is what knows they are still running.

import { useEffect, useId, useState } from 'react'
import type React from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import type { AgentSubagentSnapshot } from '../../../../shared/agent-status-types'
import { formatNativeChatWorkingElapsed } from './native-chat-duration-format'

const ROW_CLASS =
  'flex min-h-8 items-center gap-2.5 py-1 pr-3 pl-3 text-[13px] leading-6 [&+&]:shadow-[inset_0_1px_0_var(--chat-line-1)]'

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [ticking])
  return now
}

function stateLabel(state: AgentSubagentSnapshot['state']): string {
  switch (state) {
    case 'blocked':
      return translate('components.native-chat.subagents.blocked', 'Needs approval')
    case 'waiting':
      return translate('components.native-chat.subagents.waiting', 'Waiting')
    case 'idle':
      return translate('components.native-chat.subagents.idle', 'Idle')
    default:
      return translate('components.native-chat.subagents.working', 'Working')
  }
}

function SubagentRow({
  agent,
  now
}: {
  agent: AgentSubagentSnapshot
  now: number
}): React.JSX.Element {
  const working = agent.state === 'working'
  const attention = agent.state === 'blocked' || agent.state === 'waiting'
  const name =
    agent.description ||
    agent.agentType ||
    translate('components.native-chat.subagents.unnamed', 'Agent')
  return (
    <li className={ROW_CLASS}>
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          working ? 'bg-chat-accent' : attention ? 'bg-chat-warn' : 'bg-chat-ink-caption'
        )}
        aria-hidden
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          working ? 'chat-shimmer text-chat-ink-secondary' : 'text-chat-ink-tertiary'
        )}
      >
        {name}
        {agent.description && agent.agentType ? (
          <span className="ml-2 text-chat-ink-caption">{agent.agentType}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          attention ? 'text-chat-warn' : 'text-chat-ink-caption'
        )}
      >
        {working
          ? formatNativeChatWorkingElapsed(Math.max(0, now - agent.startedAt))
          : stateLabel(agent.state)}
      </span>
    </li>
  )
}

export function NativeChatSubagentTab({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const subagents = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.subagents)
  const [open, setOpen] = useState(true)
  const listId = useId()
  const active = subagents?.filter((agent) => agent.state !== 'idle').length ?? 0
  const now = useNow(open && active > 0)
  if (!subagents || subagents.length === 0) {
    return null
  }
  return (
    // Same tab anatomy as the queue: inset 8px, tucked under the composer card.
    <section
      className="relative isolate mx-2 -mb-[9px] overflow-hidden rounded-t-[16px] bg-chat-raised/60 py-0.5 backdrop-blur-[40px] backdrop-saturate-150 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-[0.5px] after:border-b-0 after:border-chat-line-1"
      aria-label={translate('components.native-chat.subagents.label', 'Running agents')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center gap-2 rounded-t-[16px] px-3 text-left text-[13px] leading-6 text-foreground transition-colors duration-100 ease-chat hover:bg-chat-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-inset motion-reduce:transition-none"
      >
        <Bot className="size-3.5 shrink-0 text-chat-ink-tertiary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">
          {active > 0
            ? translate('components.native-chat.subagents.running', '{{count}} agents running', {
                count: active
              })
            : translate('components.native-chat.subagents.allIdle', '{{count}} agents idle', {
                count: subagents.length
              })}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-chat-ink-caption transition-transform duration-100 ease-chat motion-reduce:transition-none',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <ul id={listId} className="scrollbar-sleek max-h-[160px] overflow-y-auto">
          {subagents.map((agent) => (
            <SubagentRow key={agent.id} agent={agent} now={now} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
