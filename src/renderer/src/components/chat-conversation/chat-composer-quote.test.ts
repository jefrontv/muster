import { describe, expect, it } from 'vitest'
import { quoteExcerpt, quoteMessage, splitQuotedMessage } from './chat-composer-quote'

describe('chat composer quote', () => {
  it('sends the quote as a blockquote ahead of the text', () => {
    expect(quoteMessage('First line\n\nSecond', 'Why?')).toBe('> First line\n>\n> Second\n\nWhy?')
    expect(quoteMessage('Only this', '  ')).toBe('> Only this')
  })

  it('reads the quote back off a sent message', () => {
    const sent = quoteMessage('First line\n\nSecond', 'Why?')
    expect(splitQuotedMessage(sent)).toEqual({ quote: 'First line\n\nSecond', body: 'Why?' })
    expect(splitQuotedMessage('No quote here')).toEqual({ quote: null, body: 'No quote here' })
  })

  it('cuts a long reply at a word', () => {
    const long = `${'word '.repeat(200)}end`
    const excerpt = quoteExcerpt(long)
    expect(excerpt.length).toBeLessThanOrEqual(601)
    expect(excerpt.endsWith('word…')).toBe(true)
    expect(quoteExcerpt('  short  ')).toBe('short')
  })
})
