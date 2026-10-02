import { describe, expect, it } from 'vitest'
import { selectChatThreadSessionsToStop } from './chat-thread-session-cap'

const idle = (threadId: string, touchedAt: number) => ({ threadId, touchedAt, busy: false })

describe('selectChatThreadSessionsToStop', () => {
  it('keeps up to four idle processes', () => {
    const sessions = [idle('a', 1), idle('b', 2), idle('c', 3), idle('d', 4)]
    expect(selectChatThreadSessionsToStop({ sessions, keep: new Set() })).toEqual([])
  })

  it('stops the least recently used idle ones past the cap', () => {
    const sessions = [
      idle('a', 5),
      idle('b', 1),
      idle('c', 3),
      idle('d', 4),
      idle('e', 2),
      idle('f', 6)
    ]
    expect(selectChatThreadSessionsToStop({ sessions, keep: new Set() })).toEqual(['b', 'e'])
  })

  it('never stops a busy session or the thread on screen, and busy ones do not count', () => {
    const sessions = [
      { threadId: 'busy', touchedAt: 0, busy: true },
      idle('shown', 0),
      idle('a', 1),
      idle('b', 2),
      idle('c', 3),
      idle('d', 4)
    ]
    expect(selectChatThreadSessionsToStop({ sessions, keep: new Set(['shown']) })).toEqual(['a'])
  })
})
