// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { chatDayLabel, startsNewDay } from './ChatDaySeparator'
import { conversationSegments } from './ChatConversationTurn'
import { ChatReplyBubble } from './ChatReplyBubble'
import { ChatUserBubble, userMessageCollapses } from './ChatUserBubble'

vi.mock('@/components/native-chat/NativeChatHighlightedCode', () => ({
  useCodeThemeClass: () => ''
}))

const TABLE = ['| Name | Size |', '| ---- | ---- |', '| a    | 1    |'].join('\n')

describe('ChatReplyBubble', () => {
  afterEach(cleanup)

  it('puts a one-line answer in a card and a document in bare prose', () => {
    const line = render(<ChatReplyBubble text="Yes, it is live." streaming={false} />)
    const card = line.container.querySelector('[data-chat-reply]')!
    expect(card.getAttribute('data-chat-reply')).toBe('line')
    expect(card.className).toContain('bg-chat-reply')
    cleanup()
    const prose = render(
      <ChatReplyBubble text={'## Steps\n\n1. Open it\n2. Save it'} streaming={false} />
    )
    const doc = prose.container.querySelector('[data-chat-reply]')!
    expect(doc.getAttribute('data-chat-reply')).toBe('prose')
    expect(doc.className).not.toContain('bg-chat-reply')
  })

  it('restyles in place when a streamed line grows into a list', () => {
    const { container, rerender } = render(<ChatReplyBubble text="Here you go:" streaming />)
    const before = container.querySelector('[data-chat-reply]')
    rerender(<ChatReplyBubble text={'Here you go:\n\n- one\n- two\n- three'} streaming />)
    const after = container.querySelector('[data-chat-reply]')
    expect(after).toBe(before)
    expect(after?.getAttribute('data-chat-reply')).toBe('prose')
  })

  it('draws a markdown table as a table card', () => {
    const { container } = render(<ChatReplyBubble text={TABLE} streaming={false} />)
    expect(container.querySelector('[data-chat-reply]')?.getAttribute('data-chat-reply')).toBe(
      'table'
    )
    expect(container.querySelector('[data-chat-table]')).not.toBeNull()
  })
})

describe('ChatUserBubble', () => {
  afterEach(cleanup)

  it('folds long messages by length or line count', () => {
    expect(userMessageCollapses('short')).toBe(false)
    expect(userMessageCollapses('x'.repeat(601))).toBe(true)
    expect(userMessageCollapses(Array.from({ length: 9 }, () => 'line').join('\n'))).toBe(true)
    expect(userMessageCollapses(Array.from({ length: 8 }, () => 'line').join('\n'))).toBe(false)
  })

  it('expands a folded message on request', () => {
    const { getByRole } = render(<ChatUserBubble text={'x'.repeat(700)} imageCount={0} />)
    const toggle = getByRole('button', { name: 'Show full message' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('day separators', () => {
  const at = (day: number, hour: number): number => new Date(2026, 9, day, hour).getTime()

  it('starts a day on the first turn and when the calendar day changes', () => {
    expect(startsNewDay(null, at(30, 9))).toBe(true)
    expect(startsNewDay(at(30, 1), at(30, 23))).toBe(false)
    expect(startsNewDay(at(29, 23), at(30, 0))).toBe(true)
  })

  it('names today and yesterday', () => {
    const now = at(30, 12)
    expect(chatDayLabel(at(30, 8), now)).toBe('Today')
    expect(chatDayLabel(at(29, 22), now)).toBe('Yesterday')
    expect(chatDayLabel(at(20, 8), now)).not.toMatch(/Today|Yesterday/)
  })
})

describe('conversationSegments', () => {
  it('keeps replies and steers as messages and merges the rows between them', () => {
    const items = [
      { kind: 'thinking', id: 't1', text: 'hm', streaming: false },
      { kind: 'text', id: 'a', text: 'Looking', streaming: false },
      { kind: 'steer', id: 's', text: 'also this', imageCount: 0, delivered: true },
      { kind: 'thinking', id: 't2', text: 'hm', streaming: false },
      { kind: 'thinking', id: 't3', text: 'hm', streaming: false },
      { kind: 'text', id: 'b', text: 'Done', streaming: false }
    ] as ChatEngineItem[]
    const segments = conversationSegments(items)
    expect(segments.map((segment) => segment.kind)).toEqual([
      'process',
      'reply',
      'steer',
      'process',
      'reply'
    ])
    expect(segments[3]).toMatchObject({ id: 't2', items: [{ id: 't2' }, { id: 't3' }] })
  })
})
