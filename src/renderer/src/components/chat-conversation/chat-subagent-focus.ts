// Finding a subagent's engine item, and pairing roster rows (hook events, their own ids)
// with the engine's agents (Task call ids).

import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'

export type ChatAgentItem = Extract<ChatEngineItem, { kind: 'agent' }>

/** A roster row as the subagent tab knows it. */
export type ChatRosterAgent = {
  id: string
  description?: string
  agentType?: string
  startedAt: number
}

/** Every agent in the items, depth first, in start order. */
export function collectAgents(
  items: readonly ChatEngineItem[],
  into: ChatAgentItem[] = []
): ChatAgentItem[] {
  for (const item of items) {
    if (item.kind === 'agent') {
      into.push(item)
      collectAgents(item.items, into)
    }
  }
  return into
}

export function findAgent(items: readonly ChatEngineItem[], id: string): ChatAgentItem | null {
  return collectAgents(items).find((agent) => agent.id === id) ?? null
}

/** The turn holding an agent, newest first since a live agent is usually in the last turn. */
export function findAgentTurn(
  turns: readonly Pick<ChatEngineTurn, 'id' | 'items'>[],
  id: string
): { turnId: string; agent: ChatAgentItem } | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const agent = findAgent(turns[index].items, id)
    if (agent) {
      return { turnId: turns[index].id, agent }
    }
  }
  return null
}

const sameAgent = (roster: ChatRosterAgent, agent: ChatAgentItem): boolean =>
  (roster.description ?? '') === (agent.description ?? '') &&
  (roster.agentType === undefined ||
    agent.subagentType === null ||
    roster.agentType === agent.subagentType)

/** The engine agent for a roster row: the k-th roster row with its description and type pairs
 *  with the k-th such engine agent, oldest first. Null when its steps never reached the stream. */
export function matchRosterAgent(
  roster: readonly ChatRosterAgent[],
  agents: readonly ChatAgentItem[],
  target: ChatRosterAgent
): string | null {
  const twins = roster
    .filter(
      (row) =>
        (row.description ?? '') === (target.description ?? '') &&
        (row.agentType ?? '') === (target.agentType ?? '')
    )
    .toSorted((a, b) => a.startedAt - b.startedAt)
  const rank = twins.findIndex((row) => row.id === target.id)
  const candidates = agents.filter((agent) => sameAgent(target, agent))
  return rank >= 0 ? (candidates[rank]?.id ?? null) : null
}

/** The summary worth showing: null when the agent's last message already says it. */
export function agentSummary(agent: ChatAgentItem): string | null {
  const summary = agent.summary?.trim()
  if (!summary) {
    return null
  }
  const last = agent.items.findLast((item) => item.kind === 'text')
  return last?.kind === 'text' && last.text.trim() === summary ? null : summary
}
