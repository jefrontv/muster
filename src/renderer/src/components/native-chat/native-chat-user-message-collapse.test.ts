import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_CHARS,
  NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_LINES,
  shouldCollapseUserMessage
} from './native-chat-user-message-collapse'

describe('shouldCollapseUserMessage', () => {
  it('leaves short prompts expanded', () => {
    expect(shouldCollapseUserMessage('fix the bug')).toBe(false)
  })

  it('never collapses empty or whitespace-only text', () => {
    expect(shouldCollapseUserMessage('')).toBe(false)
    expect(shouldCollapseUserMessage('  \n\n  ')).toBe(false)
  })

  it('collapses past the character threshold, not at it', () => {
    expect(shouldCollapseUserMessage('a'.repeat(NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_CHARS))).toBe(
      false
    )
    expect(
      shouldCollapseUserMessage('a'.repeat(NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_CHARS + 1))
    ).toBe(true)
  })

  it('collapses past the line threshold, not at it', () => {
    const atLimit = Array.from({ length: NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_LINES }, () => 'x')
    expect(shouldCollapseUserMessage(atLimit.join('\n'))).toBe(false)
    expect(shouldCollapseUserMessage([...atLimit, 'x'].join('\n'))).toBe(true)
  })

  it('collapses a short-but-tall prompt (many lines, few chars)', () => {
    expect(shouldCollapseUserMessage('a\nb\nc\nd\ne\nf\ng\nh\ni')).toBe(true)
  })
})
