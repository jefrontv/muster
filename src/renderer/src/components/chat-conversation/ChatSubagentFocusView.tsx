// A subagent's own steps in place of the transcript, with the way back to the main agent.
// When the agent finishes, the view says so and returns on its own unless the user is reading.

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { ArrowLeft, Bot, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { formatElapsed } from '@/components/chat-thread/chat-tool-row-model'
import { ChatProcessItems } from './ChatProcessItems'
import { ChatMarkdown } from '@/components/chat-thread/ChatMarkdown'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { ChatPill } from './ChatPill'
import { agentSummary, type ChatAgentItem } from './chat-subagent-focus'
import {
  useChatEngineAgent,
  type ChatFocusEntry,
  type ChatSubagentFocus
} from './use-chat-subagent-focus'

/** How long "Finished" shows before the view returns to the main agent. */
export const SUBAGENT_RETURN_MS = 2000

const agentName = (agent: ChatAgentItem | null, entry: ChatFocusEntry): string =>
  agent?.description ||
  agent?.subagentType ||
  entry.roster?.description ||
  entry.roster?.agentType ||
  translate('components.native-chat.subagents.unnamed', 'Agent')

function useElapsed(since: number | null, running: boolean): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null || !running) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [since, running])
  return since === null ? null : Math.max(0, Math.floor((now - since) / 1000))
}

function StateLabel(props: {
  agent: ChatAgentItem | null
  seconds: number | null
}): React.JSX.Element {
  const status = props.agent?.status ?? 'running'
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-chat-ink-secondary">
        <AgentWorkingSpinner className="size-3 text-chat-ink-secondary" />
        {translate('components.chat-conversation.focus.working', 'Working')}
        {props.seconds !== null && (
          <span className="font-mono text-xs tabular-nums text-chat-ink-tertiary">
            {formatElapsed(props.seconds)}
          </span>
        )}
      </span>
    )
  }
  const label =
    status === 'done'
      ? translate('components.chat-conversation.focus.finished', 'Finished')
      : status === 'error'
        ? translate('components.chat-conversation.focus.failed', 'Failed')
        : translate('components.chat-conversation.focus.stopped', 'Stopped')
  return (
    <span className={status === 'error' ? 'text-destructive' : 'text-chat-ink-secondary'}>
      {label}
    </span>
  )
}

/** One level of the breadcrumb, named from its live engine item. */
function Crumb(props: {
  threadId: string
  entry: ChatFocusEntry
  current: boolean
  onClick: () => void
}): React.JSX.Element {
  const found = useChatEngineAgent(props.threadId, props.entry.agentId)
  const name = agentName(found?.agent ?? null, props.entry)
  return props.current ? (
    <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
      {name}
    </span>
  ) : (
    <button
      type="button"
      onClick={props.onClick}
      className="min-w-0 truncate rounded-sm text-chat-ink-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
    >
      {name}
    </button>
  )
}

export function ChatSubagentFocusView(props: {
  threadId: string
  focus: ChatSubagentFocus
  /** Called with the agent the view leaves, so the transcript can show where it was. */
  onReturn: (agentId: string | null) => void
}): React.JSX.Element {
  const { focus, threadId } = props
  const entry = focus.stack.at(-1)!
  const found = useChatEngineAgent(threadId, entry.agentId)
  const agent = found?.agent ?? null
  const running = agent ? agent.status === 'running' : entry.roster !== null
  const seconds = useElapsed(entry.roster?.startedAt ?? null, running)
  const sawRunning = useRef(false)
  const interacted = useRef(false)
  const [held, setHeld] = useState(false)
  const { back, toMain } = focus
  const { renderAgentSteps } = useChatThreadContext()
  // Sidechain steps end with the agent's full reply, so they own the summary.
  const sidechain = agent !== null && agent.items.length === 0 && renderAgentSteps !== undefined
  const summary = agent && agent.status !== 'running' && !sidechain ? agentSummary(agent) : null
  const { onReturn } = props

  if (agent?.status === 'running') {
    sawRunning.current = true
  }
  const finishedLive = agent !== null && agent.status !== 'running' && sawRunning.current

  useEffect(() => {
    if (!finishedLive) {
      return
    }
    interacted.current = false
    const timer = window.setTimeout(() => {
      if (interacted.current) {
        setHeld(true)
        return
      }
      onReturn(entry.agentId)
      back()
    }, SUBAGENT_RETURN_MS)
    return () => window.clearTimeout(timer)
  }, [finishedLive, entry.agentId, back, onReturn])

  const leave = (levels: number): void => {
    onReturn(entry.agentId)
    back(levels)
  }
  const main = (): void => {
    onReturn(focus.stack[0]?.agentId ?? null)
    toMain()
  }
  const touch = (): void => {
    interacted.current = true
  }
  return (
    <div
      data-subagent-focus={entry.agentId ?? 'roster'}
      className="flex min-w-0 flex-col gap-3"
      onWheel={touch}
      onPointerDown={touch}
      onKeyDown={touch}
    >
      <div className="sticky top-2 z-[5] group-data-[header]/conversation:top-12 flex min-w-0 flex-col gap-1 rounded-2xl bg-chat-raised px-3 py-2 ring-[0.5px] ring-foreground/10">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <button
            type="button"
            onClick={() => leave(1)}
            aria-label={translate('components.chat-conversation.focus.back', 'Back')}
            title={translate('components.chat-conversation.focus.backHint', 'Back (Esc)')}
            className="grid size-7 shrink-0 place-items-center rounded-full text-chat-ink-secondary transition-colors duration-100 ease-chat hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <nav
            aria-label={translate('components.chat-conversation.focus.trail', 'Agents')}
            className="flex min-w-0 flex-1 items-center gap-1"
          >
            <button
              type="button"
              onClick={main}
              className="shrink-0 rounded-sm text-chat-ink-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
            >
              {translate('components.chat-conversation.focus.main', 'Main agent')}
            </button>
            {focus.stack.map((level, index) => (
              <span
                key={`${level.agentId ?? 'roster'}:${index}`}
                className="flex min-w-0 items-center gap-1"
              >
                <ChevronRight className="size-3 shrink-0 text-chat-ink-tertiary" aria-hidden />
                <Crumb
                  threadId={threadId}
                  entry={level}
                  current={index === focus.stack.length - 1}
                  onClick={() => leave(focus.stack.length - 1 - index)}
                />
              </span>
            ))}
          </nav>
          <span className="shrink-0 text-xs">
            <StateLabel agent={agent} seconds={seconds} />
          </span>
        </div>
        {(agent?.subagentType || entry.roster?.agentType) && (
          <div className="flex items-center gap-1.5 pl-9 text-xs text-chat-ink-tertiary">
            <Bot className="size-3" aria-hidden />
            {agent?.subagentType ?? entry.roster?.agentType}
          </div>
        )}
      </div>
      {agent ? (
        agent.items.length > 0 ? (
          <ChatProcessItems items={agent.items} />
        ) : renderAgentSteps ? (
          renderAgentSteps(agent)
        ) : agent.status === 'running' ? (
          <p className="text-[13px] text-chat-ink-tertiary">
            {translate('components.chat-conversation.focus.noSteps', 'Waiting for its first step')}
          </p>
        ) : null
      ) : (
        <p className="text-[13px] text-chat-ink-tertiary">
          {translate(
            'components.chat-conversation.focus.unstreamed',
            "This agent runs in the background. Its steps aren't streamed to this chat."
          )}
        </p>
      )}
      {summary && (
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-[13px] text-chat-ink-secondary ring-[0.5px] ring-foreground/10',
            finishedLive && !held && 'animate-in fade-in duration-200 motion-reduce:animate-none'
          )}
        >
          <ChatMarkdown text={summary} streaming={false} density="compact" />
        </div>
      )}
      {held && (
        <ChatPill onClick={main} className="self-center">
          <ArrowLeft className="size-3.5" aria-hidden />
          {translate('components.chat-conversation.focus.return', 'Return to main agent')}
        </ChatPill>
      )}
    </div>
  )
}
