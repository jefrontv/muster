import { describe, expect, it } from 'vitest'
import { startsUnread } from './ChatUnreadDivider'

describe('startsUnread', () => {
  it('marks only the first turn that finished after the last visit', () => {
    expect(startsUnread(100, 90, 120)).toBe(true)
    expect(startsUnread(100, 120, 130)).toBe(false)
    expect(startsUnread(100, null, 120)).toBe(true)
  })

  it('stays off with nothing unread or a turn still running', () => {
    expect(startsUnread(null, 90, 120)).toBe(false)
    expect(startsUnread(100, 90, 95)).toBe(false)
    expect(startsUnread(100, 90, null)).toBe(false)
  })
})
