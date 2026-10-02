import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { reuseStableMessages } from './native-chat-message-identity'

const msg = (id: string, text: string): NativeChatMessage => ({
  id,
  role: 'assistant',
  blocks: [{ type: 'text', text }],
  timestamp: 1,
  source: 'transcript'
})

describe('reuseStableMessages', () => {
  it('keeps unchanged messages when an older page prepends', () => {
    const previous = [msg('b', 'two'), msg('c', 'three')]
    const next = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')]
    const out = reuseStableMessages(previous, next)
    expect(out[0]).toBe(next[0])
    expect(out[1]).toBe(previous[0])
    expect(out[2]).toBe(previous[1])
  })

  it('takes the new object when a message changed', () => {
    const previous = [msg('a', 'draft')]
    const next = [msg('a', 'final')]
    expect(reuseStableMessages(previous, next)[0]).toBe(next[0])
  })

  it('returns the previous array when nothing changed', () => {
    const previous = [msg('a', 'one'), msg('b', 'two')]
    expect(reuseStableMessages(previous, [msg('a', 'one'), msg('b', 'two')])).toBe(previous)
  })
})
