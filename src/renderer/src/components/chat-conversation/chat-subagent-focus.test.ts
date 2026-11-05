import { describe, expect, it } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import {
  agentSummary,
  collectAgents,
  findAgentTurn,
  matchRosterAgent,
  type ChatAgentItem,
  type ChatRosterAgent
} from './chat-subagent-focus'

const agent = (
  id: string,
  description: string,
  items: ChatEngineItem[] = [],
  subagentType: string | null = 'Explore'
): ChatAgentItem => ({
  kind: 'agent',
  id,
  description,
  subagentType,
  status: 'running',
  summary: null,
  items
})

const row = (id: string, description: string, startedAt: number): ChatRosterAgent => ({
  id,
  description,
  agentType: 'Explore',
  startedAt
})

describe('collectAgents', () => {
  it('walks nested agents depth first', () => {
    const items = [agent('a', 'outer', [agent('b', 'inner')]), agent('c', 'next')]
    expect(collectAgents(items).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('findAgentTurn', () => {
  it('finds a nested agent and prefers the newest turn', () => {
    const turns = [
      { id: 't1', items: [agent('x', 'old')] },
      { id: 't2', items: [agent('y', 'outer', [agent('x', 'nested')])] }
    ]
    expect(findAgentTurn(turns, 'x')).toMatchObject({
      turnId: 't2',
      agent: { description: 'nested' }
    })
    expect(findAgentTurn(turns, 'missing')).toBeNull()
  })
})

describe('matchRosterAgent', () => {
  it('pairs twins by start order', () => {
    const roster = [row('h2', 'Scan files', 20), row('h1', 'Scan files', 10), row('h3', 'Other', 5)]
    const agents = [
      agent('tool1', 'Scan files'),
      agent('tool2', 'Scan files'),
      agent('tool3', 'Other')
    ]
    expect(matchRosterAgent(roster, agents, roster[1])).toBe('tool1')
    expect(matchRosterAgent(roster, agents, roster[0])).toBe('tool2')
    expect(matchRosterAgent(roster, agents, roster[2])).toBe('tool3')
  })

  it('is null when the agent never reached the stream', () => {
    const roster = [row('h1', 'Scan files', 10), row('h2', 'Scan files', 20)]
    expect(matchRosterAgent(roster, [agent('tool1', 'Scan files')], roster[1])).toBeNull()
    expect(matchRosterAgent(roster, [], roster[0])).toBeNull()
  })

  it('accepts an engine agent with no type', () => {
    const roster = [row('h1', 'Scan files', 10)]
    expect(matchRosterAgent(roster, [agent('tool1', 'Scan files', [], null)], roster[0])).toBe(
      'tool1'
    )
  })
})

describe('agentSummary', () => {
  it('drops a summary that repeats the last message', () => {
    const said: ChatEngineItem = { kind: 'text', id: 'm', text: 'Two files. ', streaming: false }
    expect(agentSummary({ ...agent('a', 'x', [said]), summary: 'Two files.' })).toBeNull()
    expect(agentSummary({ ...agent('a', 'x', [said]), summary: 'Three files.' })).toBe(
      'Three files.'
    )
    expect(agentSummary(agent('a', 'x'))).toBeNull()
  })
})
