import { describe, expect, it } from 'vitest'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import { chatThreadSortKey, computeDropSortOrder, sortChatThreads } from './chat-thread-ordering'

function thread(id: string, createdAt: number, sortOrder?: number): ChatThread {
  return {
    id,
    workspaceId: null,
    title: id,
    agent: 'claude',
    claudeSessionId: null,
    transcriptPath: null,
    createdAt,
    lastActivityAt: createdAt,
    ...(sortOrder !== undefined ? { sortOrder } : {})
  }
}

describe('sortChatThreads', () => {
  it('puts newer threads first when nothing was dragged', () => {
    const sorted = sortChatThreads([thread('old', 100), thread('new', 300), thread('mid', 200)])
    expect(sorted.map((t) => t.id)).toEqual(['new', 'mid', 'old'])
  })

  it('lets an explicit sortOrder override creation order', () => {
    const sorted = sortChatThreads([
      thread('new', 300),
      // Dragged below "new": midpoint between -300 and -100.
      thread('old', 100, -200),
      thread('mid', 200)
    ])
    expect(sorted.map((t) => t.id)).toEqual(['new', 'old', 'mid'])
  })
})

describe('computeDropSortOrder', () => {
  const rows = sortChatThreads([thread('a', 300), thread('b', 200), thread('c', 100)])

  it('drops between neighbors at their key midpoint', () => {
    const order = computeDropSortOrder(rows, 'c', 'a', true)
    expect(order).toBe((chatThreadSortKey(rows[0]!) + chatThreadSortKey(rows[1]!)) / 2)
  })

  it('drops above the first row with a gap', () => {
    const order = computeDropSortOrder(rows, 'c', 'a', false)
    expect(order).toBeLessThan(chatThreadSortKey(rows[0]!))
  })

  it('drops below the last row with a gap', () => {
    const order = computeDropSortOrder(rows, 'a', 'c', true)
    expect(order).toBeGreaterThan(chatThreadSortKey(rows[2]!))
  })

  it('ignores a self-drop', () => {
    expect(computeDropSortOrder(rows, 'a', 'a', false)).toBeNull()
  })

  it('treats a drop right next to itself as a no-op position change', () => {
    // b dropped before b's own next neighbor computes against the list minus b.
    const order = computeDropSortOrder(rows, 'b', 'c', false)
    expect(order).toBe((chatThreadSortKey(rows[0]!) + chatThreadSortKey(rows[2]!)) / 2)
  })
})

describe('sortChatThreads — pinned', () => {
  function pinnedThread(id: string, createdAt: number): ChatThread {
    return { ...thread(id, createdAt), pinned: true }
  }

  it('lifts pinned threads above everything else', () => {
    const rows = sortChatThreads([
      thread('newest', 3_000),
      pinnedThread('pinned-old', 1_000),
      thread('older', 2_000)
    ])
    expect(rows.map((t) => t.id)).toEqual(['pinned-old', 'newest', 'older'])
  })

  it('keeps the manual key deciding within each block', () => {
    const rows = sortChatThreads([
      pinnedThread('pin-b', 1_000),
      pinnedThread('pin-a', 2_000),
      thread('plain', 3_000)
    ])
    // Both pinned, so -createdAt still orders them newest-first.
    expect(rows.map((t) => t.id)).toEqual(['pin-a', 'pin-b', 'plain'])
  })
})

