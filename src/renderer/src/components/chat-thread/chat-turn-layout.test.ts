import { describe, expect, it } from 'vitest'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from './chat-tool-input'
import {
  answerText,
  CHAT_STACK_VISIBLE_ROWS,
  chatItemBlocks,
  chatItemRuns,
  toolGroupSummary,
  turnFold
} from './chat-turn-layout'

const tool = (id: string, name: string, status: ChatToolItem['status'] = 'done'): ChatToolItem => ({
  kind: 'tool',
  id,
  name,
  input: {},
  status
})
const text = (id: string, value = id): ChatEngineItem => ({
  kind: 'text',
  id,
  text: value,
  streaming: false
})
const turn = (
  items: ChatEngineItem[],
  status: ChatEngineTurn['status'] = 'done'
): ChatEngineTurn => ({
  id: 't1',
  index: 0,
  user: null,
  items,
  status,
  startedAt: 0,
  endedAt: 1,
  durationMs: 1,
  costUsd: null,
  errorMessage: null,
  toolSummaries: []
})

describe('chatItemRuns', () => {
  it('groups consecutive quiet tools and keys the group by its first call', () => {
    const runs = chatItemRuns([
      text('a'),
      tool('r1', 'Read'),
      tool('g1', 'Grep'),
      tool('b1', 'Bash'),
      text('b')
    ])
    expect(runs.map((run) => (run.kind === 'group' ? `group:${run.id}` : run.item.id))).toEqual([
      'a',
      'group:r1',
      'b'
    ])
  })

  it('leaves a lone tool ungrouped and lets edits break a run', () => {
    const runs = chatItemRuns([tool('r1', 'Read'), tool('e1', 'Edit'), tool('r2', 'Read')])
    expect(runs.map((run) => run.kind)).toEqual(['item', 'item', 'item'])
  })
})

describe('chatItemBlocks', () => {
  const thought = (id: string): ChatEngineItem => ({
    kind: 'thinking',
    id,
    text: id,
    streaming: false
  })
  // Thought/Ran pairs never group (thinking breaks a tool run), so each is its own row.
  const steps = (count: number): ChatEngineItem[] =>
    Array.from({ length: count }, (_, i) =>
      i % 2 === 0 ? thought(`t${i}`) : tool(`b${i}`, 'Bash')
    )
  const shape = (items: ChatEngineItem[]): string[] =>
    chatItemBlocks(items).map((block) =>
      block.kind === 'stack' ? `stack:${block.id}:${block.runs.length}` : 'run'
    )

  it('stacks a run of one-line steps once it outgrows the visible rows', () => {
    expect(shape(steps(CHAT_STACK_VISIBLE_ROWS + 1))).toEqual(
      Array(CHAT_STACK_VISIBLE_ROWS + 1).fill('run')
    )
    expect(shape(steps(10))).toEqual(['stack:t0:10'])
  })

  it('lets text and edits break a stack, and counts a group as one row', () => {
    const items = [
      ...steps(8),
      text('mid'),
      tool('e1', 'Edit'),
      tool('r1', 'Read'),
      tool('g1', 'Grep'),
      ...steps(2)
    ]
    expect(shape(items)).toEqual(['stack:t0:8', 'run', 'run', 'run', 'run', 'run'])
  })
})

describe('toolGroupSummary', () => {
  it('lists categories once in order and flags live and attention states', () => {
    const summary = toolGroupSummary([
      tool('1', 'Read'),
      tool('2', 'Glob'),
      tool('3', 'Read'),
      tool('4', 'Bash', 'awaiting-approval'),
      tool('5', 'mcp__site__probe', 'running')
    ])
    expect(summary).toEqual({
      live: true,
      categories: ['read', 'search', 'run', 'other'],
      needsAttention: true
    })
  })
})

describe('turnFold', () => {
  it('folds everything before the last text of a finished turn', () => {
    const fold = turnFold(turn([text('intro'), tool('r1', 'Read'), text('answer')]))
    expect(fold?.process.map((item) => item.id)).toEqual(['intro', 'r1'])
    expect(fold?.answer.map((item) => item.id)).toEqual(['answer'])
  })

  it('keeps stopped turns and text-only turns open', () => {
    expect(turnFold(turn([tool('r1', 'Read'), text('a')], 'interrupted'))).toBeNull()
    expect(turnFold(turn([text('a')]))).toBeNull()
    expect(turnFold(turn([tool('r1', 'Read')]))).toBeNull()
  })
})

describe('answerText', () => {
  it('joins the answer texts and skips other items', () => {
    expect(answerText([text('1', 'One'), tool('r', 'Read'), text('2', 'Two')])).toBe('One\n\nTwo')
  })
})
