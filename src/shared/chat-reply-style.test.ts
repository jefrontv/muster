import { describe, expect, it } from 'vitest'
import { normalizeChatReplyStyle, splitConversationalReply } from './chat-reply-style'

describe('splitConversationalReply', () => {
  it('splits on blank lines', () => {
    expect(splitConversationalReply('Found it.\n\nIt was the cache.\n\n\nWant a fix?')).toEqual([
      'Found it.',
      'It was the cache.',
      'Want a fix?'
    ])
  })

  it('keeps code fences and loose lists whole', () => {
    const text = 'Run this:\n\n```sh\nnpm test\n\nnpm run build\n```\n\n- one\n\n- two'
    expect(splitConversationalReply(text)).toEqual([
      'Run this:',
      '```sh\nnpm test\n\nnpm run build\n```',
      '- one\n\n- two'
    ])
  })

  it('holds an unclosed fence in the last part', () => {
    expect(splitConversationalReply('Here:\n\n```\na\n\nb')).toEqual(['Here:', '```\na\n\nb'])
  })
})

describe('normalizeChatReplyStyle', () => {
  it('reads anything but conversational as default', () => {
    expect(normalizeChatReplyStyle('conversational')).toBe('conversational')
    expect(normalizeChatReplyStyle('loud')).toBe('default')
    expect(normalizeChatReplyStyle(undefined)).toBe('default')
  })
})
