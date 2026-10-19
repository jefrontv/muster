import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatScrollFollow, type ChatScrollFollowState } from './chat-scroll-follow'

function port(scrollHeight = 2000, clientHeight = 500) {
  return { scrollTop: scrollHeight - clientHeight, scrollHeight, clientHeight }
}

describe('ChatScrollFollow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    // The controller is clock-driven by its callers; it must never leave a timer behind.
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('stays pinned as content grows', () => {
    const p = port()
    const follow = new ChatScrollFollow(p)
    p.scrollHeight = 2600
    follow.onContentResize()
    expect(p.scrollTop).toBe(2100)
    expect(follow.state()).toEqual({ following: true, away: false })
  })

  it('releases only on user intent, and re-pins near the bottom', () => {
    const p = port()
    const changes: ChatScrollFollowState[] = []
    const follow = new ChatScrollFollow(p, (state) => changes.push(state))
    follow.noteIntent(1000)
    p.scrollTop = 900
    follow.onScroll(1050)
    expect(follow.state()).toEqual({ following: false, away: true })
    p.scrollHeight = 2600
    follow.onContentResize()
    expect(p.scrollTop).toBe(900)

    follow.noteIntent(2000)
    p.scrollTop = 2090
    follow.onScroll(2010)
    expect(follow.state()).toEqual({ following: true, away: false })
    expect(changes).toEqual([
      { following: false, away: true },
      { following: true, away: false }
    ])
  })

  it('ignores a scroll that arrives without intent and pins again', () => {
    const p = port()
    const follow = new ChatScrollFollow(p)
    p.scrollTop = 600
    follow.onScroll(5000)
    expect(p.scrollTop).toBe(1500)
    expect(follow.state().following).toBe(true)
  })

  it('treats a held scrollbar drag as intent until release', () => {
    const p = port()
    const follow = new ChatScrollFollow(p)
    follow.pointerDown()
    p.scrollTop = 400
    follow.onScroll(10_000)
    expect(follow.state().following).toBe(false)
    follow.pointerUp(10_100)
    expect(follow.state().following).toBe(false)
  })

  it('stays put after a programmatic jump once released', () => {
    const p = port()
    const follow = new ChatScrollFollow(p)
    follow.release()
    p.scrollTop = 200
    follow.onScroll(9_000)
    expect(p.scrollTop).toBe(200)
    expect(follow.state()).toEqual({ following: false, away: true })
  })

  it('follows on demand and restores a saved position', () => {
    const p = port()
    const follow = new ChatScrollFollow(p)
    follow.restore(300)
    expect(p.scrollTop).toBe(300)
    expect(follow.state()).toEqual({ following: false, away: true })
    follow.follow()
    expect(p.scrollTop).toBe(1500)
    expect(follow.state()).toEqual({ following: true, away: false })
  })
})
