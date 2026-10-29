// Cases ported from the muster-bots fork (formatted-reply.test.ts, reply-style.test.ts), Apache-2.0.

import { describe, expect, it } from 'vitest'
import {
  chatReplyShape,
  isFormattedReply,
  splitConversationalReply,
  splitReplyBlocks
} from './chat-reply-shape'

describe('isFormattedReply', () => {
  it.each([
    ['a bullet list', 'Three things:\n- Acme\n- Priya'],
    ['a numbered list', '1. Acme wants the invoice'],
    ['a heading', '## By sender\nAcme wrote twice.'],
    ['a code fence', 'The filter:\n```js\nmail.filter(Boolean)\n```'],
    ['a quote', '> I archived 31 newsletters.'],
    ['a table', '| Sender | Emails |\n| --- | ---: |\n| Acme | 4 |']
  ])('treats %s as formatted', (_label, text) => {
    expect(isFormattedReply(text)).toBe(true)
  })

  it.each([
    ['a chat line', 'Done. I will look every morning at 8.'],
    ['two paragraphs', 'Done.\n\nI will write here when something needs you.'],
    ['a dash inside a sentence', 'Acme - the invoice - is due Friday.'],
    ['a pipe inside a sentence', 'Pick red | blue'],
    ['a hashtag', '#launch went well'],
    ['a number that starts a line', '2024 was a good year.']
  ])('keeps %s as a chat line', (_label, text) => {
    expect(isFormattedReply(text)).toBe(false)
  })
})

describe('chatReplyShape', () => {
  it('picks a card, prose or table shape', () => {
    expect(chatReplyShape('Done, the file is saved.')).toBe('line')
    expect(chatReplyShape('Steps:\n- one\n- two')).toBe('prose')
    expect(chatReplyShape('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('table')
  })
})

describe('splitReplyBlocks', () => {
  const table = '| Sender | Emails |\n|---|---:|\n| Acme | 4 |\n| Priya | 2 |'

  it('keeps a reply with no table as one prose block', () => {
    expect(splitReplyBlocks('Hello\n\n- one\n- two')).toEqual([
      { kind: 'prose', text: 'Hello\n\n- one\n- two' }
    ])
  })

  it('lifts each table out between the prose around it', () => {
    const text = `Here is the summary.\n\n## By sender\n${table}\n\nWant me to reply?`
    expect(splitReplyBlocks(text)).toEqual([
      { kind: 'prose', text: 'Here is the summary.\n\n## By sender' },
      { kind: 'table', text: table },
      { kind: 'prose', text: 'Want me to reply?' }
    ])
  })

  it('returns a table-only reply as one block and splits two tables apart', () => {
    expect(splitReplyBlocks(table)).toEqual([{ kind: 'table', text: table }])
    expect(splitReplyBlocks(`${table}\n\n${table}`).map((block) => block.kind)).toEqual([
      'table',
      'table'
    ])
  })

  it('ignores pipes inside a fence and needs a delimiter row', () => {
    const fenced = '```md\n| a | b |\n|---|---|\n```'
    expect(splitReplyBlocks(fenced)).toEqual([{ kind: 'prose', text: fenced }])
    expect(splitReplyBlocks('| just | pipes |\nno delimiter')).toEqual([
      { kind: 'prose', text: '| just | pipes |\nno delimiter' }
    ])
  })
})

describe('splitConversationalReply', () => {
  it('splits short paragraphs into separate messages', () => {
    expect(
      splitConversationalReply('Found it.\n\nThe file is in src.\n\n\nWant me to open it?')
    ).toEqual(['Found it.', 'The file is in src.', 'Want me to open it?'])
  })

  it('keeps a single paragraph as one message', () => {
    expect(splitConversationalReply('Just one line\nand its second line')).toEqual([
      'Just one line\nand its second line'
    ])
  })

  it('never cuts a code fence that holds blank lines', () => {
    const code = '```ts\nconst a = 1;\n\nconst b = 2;\n```'
    expect(splitConversationalReply(`Here you go.\n\n${code}\n\nThat is it.`)).toEqual([
      'Here you go.',
      code,
      'That is it.'
    ])
  })

  it('keeps a still streaming fence in the last part', () => {
    expect(splitConversationalReply('Done.\n\n```py\nx = 1\n\ny = 2')).toEqual([
      'Done.',
      '```py\nx = 1\n\ny = 2'
    ])
  })

  it('keeps the blocks of one loose list together', () => {
    expect(splitConversationalReply('Two options.\n\n- first\n\n- second\n\nPick one?')).toEqual([
      'Two options.',
      '- first\n\n- second',
      'Pick one?'
    ])
  })

  it('keeps the indentation of an indented code block', () => {
    expect(splitConversationalReply('Run this:\n\n    npm test\n\nDone?')).toEqual([
      'Run this:',
      '    npm test',
      'Done?'
    ])
  })

  it('returns nothing for blank text', () => {
    expect(splitConversationalReply('  \n\n ')).toEqual([])
  })
})
