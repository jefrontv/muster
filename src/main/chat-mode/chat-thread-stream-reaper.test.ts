import { describe, expect, it } from 'vitest'
import type { ChatEngineSnapshot } from '../../shared/chat-engine-types'
import { emptyChatEngineMeta } from './engine/chat-engine-thread'
import { isChatThreadBusy, selectChatStreamsToReap } from './chat-thread-stream-reaper'

const MIN = 60_000
const NOW = 100 * MIN
const limits = { idleMs: 10 * MIN, maxLive: 3 }
const candidate = (threadId: string, idleMinutes: number, extra = {}) => ({
  threadId,
  lastActivityAt: NOW - idleMinutes * MIN,
  busy: false,
  watched: false,
  ...extra
})

describe('selectChatStreamsToReap', () => {
  it('stops chats idle past the limit, oldest first, and spares busy or watched ones', () => {
    expect(
      selectChatStreamsToReap(
        [
          candidate('recent', 2),
          candidate('old', 30),
          candidate('older', 45),
          candidate('busy', 60, { busy: true }),
          candidate('watched', 60, { watched: true })
        ],
        NOW,
        limits
      )
    ).toEqual(['older', 'old'])
  })

  it('trims the least recently active idle chats past the live cap', () => {
    const live = ['a', 'b', 'c', 'd', 'e'].map((id, index) => candidate(id, index + 1))
    expect(selectChatStreamsToReap(live, NOW, limits)).toEqual(['e', 'd'])
  })

  it('never trims below the cap using busy chats', () => {
    const live = [
      candidate('a', 1, { busy: true }),
      candidate('b', 2, { busy: true }),
      candidate('c', 3, { busy: true }),
      candidate('d', 4, { busy: true }),
      candidate('e', 5)
    ]
    expect(selectChatStreamsToReap(live, NOW, limits)).toEqual(['e'])
  })
})

describe('isChatThreadBusy', () => {
  const snapshot = (patch: Partial<ChatEngineSnapshot['meta']> = {}): ChatEngineSnapshot => ({
    version: 1,
    meta: { ...emptyChatEngineMeta('t'), ...patch },
    turns: []
  })

  it('counts running work, pending questions, queued messages and background tasks', () => {
    expect(isChatThreadBusy(snapshot())).toBe(false)
    expect(isChatThreadBusy(snapshot({ status: 'working' }))).toBe(true)
    expect(
      isChatThreadBusy(
        snapshot({
          queue: { items: [{ id: 'q', text: 'x', queuedAt: 0, state: 'queued' }], paused: false }
        })
      )
    ).toBe(true)
    expect(
      isChatThreadBusy(
        snapshot({
          tasks: [
            {
              taskId: 't1',
              toolUseId: null,
              type: 'local_bash',
              description: 'npm run dev',
              subagentType: null,
              status: 'running',
              summary: null,
              startedAt: 0,
              endedAt: null,
              toolUses: null
            }
          ]
        })
      )
    ).toBe(true)
  })
})
