import { describe, expect, it, vi } from 'vitest'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import { createCoalescingStreamEmitter } from './chat-thread-stream-delta-coalesce'

describe('createCoalescingStreamEmitter', () => {
  it('merges a burst of deltas into one frame', () => {
    vi.useFakeTimers()
    try {
      const sent: ChatThreadStreamEvent[] = []
      const emitter = createCoalescingStreamEmitter('t1', (e) => sent.push(e), 50)
      emitter.emit({ threadId: 't1', kind: 'delta', text: 'Hel' })
      emitter.emit({ threadId: 't1', kind: 'delta', text: 'lo ' })
      emitter.emit({ threadId: 't1', kind: 'delta', text: 'world' })
      expect(sent).toEqual([])
      vi.advanceTimersByTime(50)
      expect(sent).toEqual([{ threadId: 't1', kind: 'delta', text: 'Hello world' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes pending deltas before a lifecycle event to preserve order', () => {
    vi.useFakeTimers()
    try {
      const sent: ChatThreadStreamEvent[] = []
      const emitter = createCoalescingStreamEmitter('t1', (e) => sent.push(e), 50)
      emitter.emit({ threadId: 't1', kind: 'delta', text: 'partial' })
      emitter.emit({ threadId: 't1', kind: 'message-final' })
      expect(sent).toEqual([
        { threadId: 't1', kind: 'delta', text: 'partial' },
        { threadId: 't1', kind: 'message-final' }
      ])
      vi.advanceTimersByTime(100)
      expect(sent).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose flushes the tail delta', () => {
    vi.useFakeTimers()
    try {
      const sent: ChatThreadStreamEvent[] = []
      const emitter = createCoalescingStreamEmitter('t1', (e) => sent.push(e), 50)
      emitter.emit({ threadId: 't1', kind: 'delta', text: 'tail' })
      emitter.dispose()
      expect(sent).toEqual([{ threadId: 't1', kind: 'delta', text: 'tail' }])
    } finally {
      vi.useRealTimers()
    }
  })
})
