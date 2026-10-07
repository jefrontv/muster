// A send made mid-turn reaches the transcript as a decoded queued prompt; it must retire the echo
// (which is what ends "Working…") and leave nothing pinned at the end of the list.
import { beforeEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  appendPendingSendCache,
  clearPendingSendCacheForTests,
  pendingSendsAsMessages,
  prunePendingSends
} from './native-chat-pending'

const at = (id: string, role: 'user' | 'assistant', text: string, timestamp: number) =>
  ({
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript'
  }) as NativeChatMessage

describe('mid-turn sends', () => {
  beforeEach(() => clearPendingSendCacheForTests())

  it('retire once the queued prompt and the reply after it are in the transcript', () => {
    const before = [
      at('u1', 'user', 'Does this issue also exist on fc-business?', 100),
      at('a1', 'assistant', 'Checking the branches…', 105)
    ]
    const pending = appendPendingSendCache(
      { paneKey: 'thread', agent: 'claude' },
      { id: 'p1', text: 'you might need to clone it', sentAt: 109, afterMessageId: 'a1' }
    )
    const settled = [
      ...before,
      at('q1', 'user', 'you might need to clone it', 110),
      at('a2', 'assistant', 'No, at least not in the code.', 200)
    ]

    expect(pendingSendsAsMessages(pending, settled)).toEqual([])
    expect(prunePendingSends(pending, settled)).toEqual([])
  })
})
