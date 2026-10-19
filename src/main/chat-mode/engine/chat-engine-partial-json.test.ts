import { describe, expect, it } from 'vitest'
import { parsePartialJson } from './chat-engine-partial-json'

describe('parsePartialJson', () => {
  it.each([
    ['', undefined],
    ['{', {}],
    ['{"comm', {}],
    ['{"command"', {}],
    ['{"command":', {}],
    ['{"command":"ls -', { command: 'ls -' }],
    ['{"command":"ls","timeout":12', { command: 'ls', timeout: 12 }],
    ['{"command":"ls","run_in_background":tr', { command: 'ls' }],
    [
      '{"edits":[{"old_string":"a","new_string":"b"},{"old_',
      { edits: [{ old_string: 'a', new_string: 'b' }, {}] }
    ],
    ['{"todos":["one","tw', { todos: ['one', 'tw'] }],
    ['{"content":"line\\', { content: 'line' }],
    ['{"content":"caf\\u00', { content: 'caf' }],
    ['{"content":"say \\"hi\\" ', { content: 'say "hi" ' }],
    ['{"a":{"b":[1,2', { a: { b: [1, 2] } }]
  ])('reads %j', (input, expected) => {
    expect(parsePartialJson(input)).toEqual(expected)
  })

  it('reads every prefix of a real input without throwing, ending at the full value', () => {
    const full = JSON.stringify({
      file_path: '/site/style.css',
      old_string: 'height: 100vh;\n',
      new_string: 'height: 100dvh; /* "dynamic" */\n',
      replace_all: false
    })
    for (let end = 0; end <= full.length; end += 1) {
      const value = parsePartialJson(full.slice(0, end))
      expect(value === undefined || typeof value === 'object').toBe(true)
    }
    expect(parsePartialJson(full)).toEqual(JSON.parse(full))
  })
})
