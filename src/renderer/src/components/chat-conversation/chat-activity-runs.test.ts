import { describe, expect, it } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import { chatProcessBlocks, describeRun, turnFoldLabel } from './chat-activity-runs'

const tool = (id: string, name: string, status: ChatToolItem['status'] = 'done'): ChatToolItem => ({
  kind: 'tool',
  id,
  name,
  input: {},
  status
})

const shape = (items: ChatEngineItem[]): string[] =>
  chatProcessBlocks(items).map((block) =>
    block.kind === 'run' ? `run:${block.items.map((item) => item.id).join('+')}` : block.kind
  )

describe('chatProcessBlocks', () => {
  it('folds finished calls in a row into one run', () => {
    expect(shape([tool('a', 'Read'), tool('b', 'Grep'), tool('c', 'Bash')])).toEqual(['run:a+b+c'])
  })

  it('keeps a lone finished call as its own card', () => {
    expect(shape([tool('a', 'Read')])).toEqual(['tool'])
  })

  it('breaks a run at live, failed and waiting calls', () => {
    expect(
      shape([
        tool('a', 'Read'),
        tool('b', 'Read'),
        tool('c', 'Bash', 'running'),
        tool('d', 'Read'),
        tool('e', 'Bash', 'error'),
        tool('f', 'Read'),
        tool('g', 'Read'),
        tool('h', 'Bash', 'awaiting-approval')
      ])
    ).toEqual(['run:a+b', 'tool', 'tool', 'tool', 'run:f+g', 'tool'])
  })

  it('keeps edits, plans and questions out of runs so their bodies stay in view', () => {
    expect(
      shape([tool('a', 'Read'), tool('b', 'Edit'), tool('c', 'Read'), tool('d', 'TodoWrite')])
    ).toEqual(['tool', 'tool', 'tool', 'tool'])
  })

  it('gives thinking, subagents and notices their own blocks', () => {
    expect(
      shape([
        { kind: 'thinking', id: 't', text: 'hmm', streaming: false },
        tool('a', 'Read'),
        tool('b', 'Read'),
        {
          kind: 'agent',
          id: 'g',
          description: 'Explore',
          subagentType: null,
          status: 'done',
          summary: null,
          items: []
        },
        { kind: 'notice', id: 'n', level: 'info', text: 'Compacted' }
      ])
    ).toEqual(['thinking', 'run:a+b', 'agent', 'notice'])
  })
})

describe('describeRun', () => {
  it('counts repeated tools and keeps first-seen order', () => {
    expect(describeRun([tool('a', 'Read'), tool('b', 'Grep'), tool('c', 'Read')])).toBe(
      '3 steps: Read ×2, Grep'
    )
  })

  it('names MCP tools without their server prefix', () => {
    expect(
      describeRun([tool('a', 'mcp__plugin_context7_context7__query-docs'), tool('b', 'Read')])
    ).toBe('2 steps: query-docs, Read')
  })

  it('caps the names at three', () => {
    expect(
      describeRun([
        tool('a', 'Read'),
        tool('b', 'Grep'),
        tool('c', 'Glob'),
        tool('d', 'Bash'),
        tool('e', 'WebFetch')
      ])
    ).toBe('5 steps: Read, Grep, Glob +2 more')
  })
})

describe('turnFoldLabel', () => {
  it('reads the time worked, or how the turn ended', () => {
    expect(turnFoldLabel({ status: 'done', durationMs: 29_000 })).toBe('Worked for 29s')
    expect(turnFoldLabel({ status: 'done', durationMs: 125_000 })).toBe('Worked for 2m 05s')
    expect(turnFoldLabel({ status: 'done', durationMs: 400 })).toBe('Worked')
    expect(turnFoldLabel({ status: 'done', durationMs: null })).toBe('Worked')
    expect(turnFoldLabel({ status: 'interrupted', durationMs: 5000 })).toBe('Stopped')
    expect(turnFoldLabel({ status: 'error', durationMs: 5000 })).toBe('Failed')
  })
})
