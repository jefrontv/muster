// The pane's live subagents and teammates, as a tab tucked under the composer.
// Background agents return their tool call at once, so the transcript alone
// would show them done; the hook roster is what knows they are still running.
// Idle agents from an earlier pass fold away once the next pass starts.

import { useEffect, useId, useState } from 'react'
import type React from 'react'
import { Bot, ChevronDown } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useAppStore } from '../../store'
import type { AgentSubagentSnapshot } from '../../../../shared/agent-status-types'
import { CHAT_SEAT_TAB_CLASS, CHAT_SEAT_TAB_ENTER_CLASS } from './chat-seat-composer-classes'
import { formatNativeChatWorkingElapsed } from './native-chat-duration-format'
import { useClearedSubagents } from './use-cleared-subagents'

// A spawned agent rises into the list; going idle fades its colours and swaps the label in.
const ROW_CLASS =
  'flex min-h-8 items-center gap-2.5 py-1 pr-3 pl-3 text-[13px] leading-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none'

/** Height and opacity fold together, so a cleared row closes up instead of vanishing. */
const FOLD_CLASS =
  'grid transition-[grid-template-rows,opacity] duration-200 ease-chat motion-reduce:transition-none'

const STATE_SWAP_CLASS = 'animate-in fade-in-0 duration-300 motion-reduce:animate-none'

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
  now,
  cleared,
  divided
}: {
  agent: AgentSubagentSnapshot
  now: number
  cleared: boolean
  divided: boolean
}): React.JSX.Element {
  const working = agent.state === 'working'
  const attention = agent.state === 'blocked' || agent.state === 'waiting'
  const name =
    agent.description ||
    agent.agentType ||
    translate('components.native-chat.subagents.unnamed', 'Agent')
  return (
    <li
      className={cn(FOLD_CLASS, cleared ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]')}
      aria-hidden={cleared || undefined}
      inert={cleared}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={cn(ROW_CLASS, divided && 'shadow-[inset_0_1px_0_var(--chat-line-1)]')}>
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full transition-colors duration-300 motion-reduce:transition-none',
              working
                ? 'bg-chat-accent motion-safe:animate-pulse'
                : attention
                  ? 'bg-chat-warn'
                  : 'bg-chat-ink-caption'
            )}
            aria-hidden
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate transition-colors duration-300 motion-reduce:transition-none',
              working ? 'chat-shimmer text-chat-ink-secondary' : 'text-chat-ink-tertiary'
            )}
          >
            {name}
            {agent.description && agent.agentType ? (
              <span className="ml-2 text-chat-ink-caption">{agent.agentType}</span>
            ) : null}
          </span>
          <span
            key={agent.state}
            className={cn(
              'shrink-0 text-xs tabular-nums',
              STATE_SWAP_CLASS,
              attention ? 'text-chat-warn' : 'text-chat-ink-caption'
            )}
          >
            {working
              ? formatNativeChatWorkingElapsed(Math.max(0, now - agent.startedAt))
              : stateLabel(agent.state)}
          </span>
        </div>
      </div>
    </li>
  )
}

export function NativeChatSubagentTab({ paneKey }: { paneKey: string }): React.JSX.Element | null {
  const subagents = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.subagents)
  const paneState = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state)
  const cleared = useClearedSubagents(paneState, subagents)
  const [open, setOpen] = useState(true)
  // Set once the tab's exit animation ends, so it stops taking room in the seat.
  const [gone, setGone] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const listId = useId()
  const active = subagents?.filter((agent) => agent.state !== 'idle').length ?? 0
  const shown = subagents?.filter((agent) => !cleared.has(agent.id)).length ?? 0
  const now = useNow(open && active > 0)
  const leaving = shown === 0
  if (!leaving && gone) {
    setGone(false)
  }
  if (!subagents || subagents.length === 0 || (leaving && (gone || reducedMotion))) {
    return null
  }
  let divided = false
  return (
    <section
      className={cn(
        CHAT_SEAT_TAB_CLASS,
        leaving
          ? 'pointer-events-none animate-out fade-out-0 slide-out-to-bottom-4 fill-mode-forwards duration-200'
          : CHAT_SEAT_TAB_ENTER_CLASS
      )}
      aria-hidden={leaving || undefined}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          setGone(true)
        }
      }}
      aria-label={translate('components.native-chat.subagents.label', 'Running agents')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-full items-center gap-2 rounded-t-[18px] px-3 text-left text-[13px] leading-6 text-foreground transition-colors duration-100 ease-chat hover:bg-chat-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-inset motion-reduce:transition-none"
      >
        <Bot className="size-3.5 shrink-0 text-chat-ink-tertiary" aria-hidden />
        <span
          key={active > 0 ? 'running' : 'idle'}
          className={cn('min-w-0 flex-1 truncate font-medium', STATE_SWAP_CLASS)}
        >
          {active > 0
            ? translate('components.native-chat.subagents.running', '{{count}} agents running', {
                count: active
              })
            : translate('components.native-chat.subagents.allIdle', '{{count}} agents idle', {
                count: shown
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
          {subagents.map((agent) => {
            const isCleared = cleared.has(agent.id)
            const row = (
              <SubagentRow
                key={agent.id}
                agent={agent}
                now={now}
                cleared={isCleared}
                divided={divided && !isCleared}
              />
            )
            divided ||= !isCleared
            return row
          })}
        </ul>
      ) : null}
    </section>
  )
}
