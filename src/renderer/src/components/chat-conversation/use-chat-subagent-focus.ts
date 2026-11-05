// Which subagent the transcript is focused on, as a stack for nested agents. Per thread
// and in memory only: reopening the chat starts on the main agent.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { chatEngineThreadStore } from '@/components/chat-thread/chat-engine-thread-store'
import {
  collectAgents,
  findAgentTurn,
  matchRosterAgent,
  type ChatAgentItem,
  type ChatRosterAgent
} from './chat-subagent-focus'

/** A focused agent: an engine agent, or a roster row whose steps never reached the stream. */
export type ChatFocusEntry =
  | { agentId: string; roster: ChatRosterAgent | null }
  | {
      agentId: null
      roster: ChatRosterAgent
    }

export type ChatSubagentFocus = {
  stack: readonly ChatFocusEntry[]
  open: (entry: ChatFocusEntry) => void
  openRoster: (roster: readonly ChatRosterAgent[], target: ChatRosterAgent) => void
  /** Pops `levels` (default one); popping past the top returns to the main agent. */
  back: (levels?: number) => void
  toMain: () => void
}

function engineTurns(threadId: string): { id: string; items: ChatAgentItem['items'] }[] {
  const view = chatEngineThreadStore().read(threadId)
  return (view?.order ?? []).flatMap((id) => {
    const turn = view?.turns.get(id)
    return turn ? [turn] : []
  })
}

export function useChatSubagentFocus(threadId: string): ChatSubagentFocus {
  const [stack, setStack] = useState<ChatFocusEntry[]>([])
  const [owner, setOwner] = useState(threadId)
  if (owner !== threadId) {
    setOwner(threadId)
    setStack([])
  }
  const open = useCallback(
    (entry: ChatFocusEntry) =>
      setStack((current) =>
        current.at(-1)?.agentId === entry.agentId && entry.agentId !== null
          ? current
          : [...current, entry]
      ),
    []
  )
  const back = useCallback(
    (levels = 1) => setStack((current) => current.slice(0, Math.max(0, current.length - levels))),
    []
  )
  const toMain = useCallback(() => setStack([]), [])
  const openRoster = useCallback(
    (roster: readonly ChatRosterAgent[], target: ChatRosterAgent) => {
      // Roster rows describe the current run, so pair them with the latest turn's agents.
      const latest = engineTurns(threadId).at(-1)
      const agentId = latest ? matchRosterAgent(roster, collectAgents(latest.items), target) : null
      setStack(agentId ? [{ agentId, roster: target }] : [{ agentId: null, roster: target }])
    },
    [threadId]
  )

  useEffect(() => {
    if (stack.length === 0) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target
      // Esc in a field belongs to the field (pickers, rename, the composer's own menus).
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, [role="dialog"]'))
      ) {
        return
      }
      event.preventDefault()
      back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stack.length, back])

  return useMemo(
    () => ({ stack, open, openRoster, back, toMain }),
    [stack, open, openRoster, back, toMain]
  )
}

/** The live engine item for a focused agent, and its turn; null while it is not in the stream. */
export function useChatEngineAgent(
  threadId: string,
  agentId: string | null
): { turnId: string; agent: ChatAgentItem } | null {
  const subscribe = useCallback(
    (listener: () => void) => chatEngineThreadStore().subscribe(threadId, listener),
    [threadId]
  )
  // The agent item is replaced on every patch to it, so it is a stable snapshot between patches.
  const agent = useSyncExternalStore(subscribe, () =>
    agentId ? (findAgentTurn(engineTurns(threadId), agentId)?.agent ?? null) : null
  )
  const turnId = useSyncExternalStore(subscribe, () =>
    agentId ? (findAgentTurn(engineTurns(threadId), agentId)?.turnId ?? null) : null
  )
  return useMemo(() => (agent && turnId ? { turnId, agent } : null), [agent, turnId])
}
