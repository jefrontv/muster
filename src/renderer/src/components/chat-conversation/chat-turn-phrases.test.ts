import { describe, expect, it } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import {
  phraseAt,
  phraseHoldMs,
  toolPhrases,
  turnIsAnswering,
  turnNowPhrases
} from './chat-turn-phrases'

const tool = (
  name: string,
  input: Record<string, unknown> = {},
  status: ChatToolItem['status'] = 'running'
): ChatToolItem => ({ kind: 'tool', id: `t-${name}`, name, input, status })

describe('toolPhrases', () => {
  it('names the file and keeps the full path for the tooltip', () => {
    expect(toolPhrases(tool('Read', { file_path: '/site/notes.txt' }))).toMatchObject({
      phrases: ['Reading notes.txt', 'Reading through', 'Looking it over'],
      hover: '/site/notes.txt'
    })
    expect(toolPhrases(tool('Edit', { file_path: 'C:\\site\\a.ts' })).phrases[0]).toBe(
      'Editing a.ts'
    )
  })

  it('waits for the whole path before naming the file', () => {
    expect(
      toolPhrases(tool('Read', { file_path: '/private/tmp/cla' }, 'streaming')).phrases[0]
    ).toBe('Reading through')
  })

  it("leads a command with Claude's own description of it", () => {
    expect(
      toolPhrases(tool('Bash', { command: 'pnpm test', description: 'Run the tests' }))
    ).toMatchObject({ phrases: ['Run the tests', 'Checking the output'], hover: 'pnpm test' })
    expect(toolPhrases(tool('Bash', { command: 'ls' })).phrases[0]).toBe('Running a command')
  })

  it('reads sites, MCP servers and unknown tools by name', () => {
    expect(toolPhrases(tool('WebFetch', { url: 'https://www.example.com/a' })).phrases[0]).toBe(
      'Reading example.com'
    )
    expect(toolPhrases(tool('mcp__plugin_context7_context7__query-docs')).phrases).toEqual([
      'Using context7'
    ])
    expect(toolPhrases(tool('Frobnicate')).phrases).toEqual(['Using Frobnicate'])
  })

  it('waits on approval with one phrase and its own phase', () => {
    const waiting = toolPhrases(tool('Bash', { command: 'rm x' }, 'awaiting-approval'))
    expect(waiting.phrases).toEqual(['Waiting for your approval'])
    expect(waiting.phase).not.toBe(toolPhrases(tool('Bash', { command: 'rm x' })).phase)
  })
})

describe('turnNowPhrases', () => {
  it('follows the last live call, inside a running subagent too', () => {
    const items: ChatEngineItem[] = [
      tool('Read', { file_path: '/a.ts' }, 'done'),
      {
        kind: 'agent',
        id: 'g',
        description: 'Explore',
        subagentType: null,
        status: 'running',
        summary: null,
        items: [tool('Grep', { pattern: 'TODO' })]
      }
    ]
    expect(turnNowPhrases({ id: 'turn', items })).toMatchObject({
      phrases: ['Searching files', 'Narrowing it down'],
      hover: 'TODO'
    })
  })

  it('thinks when nothing is running', () => {
    const now = turnNowPhrases({ id: 'turn', items: [tool('Read', {}, 'done')] })
    expect(now.phase).toBe('think:turn')
    expect(now.phrases[0]).toBe('Thinking')
  })
})

describe('turnIsAnswering', () => {
  it('is true once answer text has arrived after the last step', () => {
    const text = (value: string): ChatEngineItem => ({
      kind: 'text',
      id: 'x',
      text: value,
      streaming: true
    })
    expect(turnIsAnswering({ items: [tool('Read'), text('Here')] })).toBe(true)
    expect(turnIsAnswering({ items: [tool('Read'), text('  ')] })).toBe(false)
    expect(turnIsAnswering({ items: [text('Let me check'), tool('Read')] })).toBe(false)
  })
})

describe('phrase rotation', () => {
  it('starts on the lead, visits every alternate once, then returns to the lead', () => {
    const phrases = ['Lead', 'A', 'B', 'C']
    expect(phraseAt(phrases, 'seed', 0)).toBe('Lead')
    const cycle = [1, 2, 3, 4].map((step) => phraseAt(phrases, 'seed', step))
    expect(cycle.slice(0, 3).sort()).toEqual(['A', 'B', 'C'])
    expect(cycle[3]).toBe('Lead')
    expect(phraseAt(['Only'], 'seed', 5)).toBe('Only')
  })

  it('holds each phrase for 4 to 6 seconds', () => {
    for (let step = 0; step < 20; step += 1) {
      const ms = phraseHoldMs('seed', step)
      expect(ms).toBeGreaterThanOrEqual(4000)
      expect(ms).toBeLessThanOrEqual(6000)
    }
  })
})
