import { describe, expect, it } from 'vitest'
import {
  hasMoreNativeChatHistory,
  NATIVE_CHAT_INITIAL_LIMIT,
  NATIVE_CHAT_PAGE,
  nextNativeChatLimit
} from './native-chat-pagination'

describe('nextNativeChatLimit', () => {
  it('grows the limit by one page', () => {
    expect(nextNativeChatLimit(NATIVE_CHAT_INITIAL_LIMIT)).toBe(
      NATIVE_CHAT_INITIAL_LIMIT + NATIVE_CHAT_PAGE
    )
    expect(nextNativeChatLimit(NATIVE_CHAT_INITIAL_LIMIT + NATIVE_CHAT_PAGE)).toBe(
      NATIVE_CHAT_INITIAL_LIMIT + 2 * NATIVE_CHAT_PAGE
    )
  })
})

describe('hasMoreNativeChatHistory', () => {
  it('reports more when the read filled the requested window', () => {
    expect(hasMoreNativeChatHistory(NATIVE_CHAT_INITIAL_LIMIT, NATIVE_CHAT_INITIAL_LIMIT)).toBe(
      true
    )
    expect(hasMoreNativeChatHistory(NATIVE_CHAT_INITIAL_LIMIT + 1, NATIVE_CHAT_INITIAL_LIMIT)).toBe(
      true
    )
  })

  it('reports done when the read returned fewer than requested (head reached)', () => {
    expect(hasMoreNativeChatHistory(NATIVE_CHAT_INITIAL_LIMIT - 1, NATIVE_CHAT_INITIAL_LIMIT)).toBe(
      false
    )
    expect(hasMoreNativeChatHistory(0, NATIVE_CHAT_INITIAL_LIMIT)).toBe(false)
  })
})
