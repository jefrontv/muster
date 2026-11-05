import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps the chat font size beside a text colour', () => {
    expect(cn('text-chat text-foreground')).toBe('text-chat text-foreground')
    expect(cn('text-chat', 'text-chat-ink-secondary')).toBe('text-chat text-chat-ink-secondary')
  })

  it('still lets a later size or colour win', () => {
    expect(cn('text-sm', 'text-chat')).toBe('text-chat')
    expect(cn('text-chat-ink-tertiary', 'text-foreground')).toBe('text-foreground')
  })
})
