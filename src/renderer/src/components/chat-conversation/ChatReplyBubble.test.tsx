// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { ChatReplyBubble } from './ChatReplyBubble'

const TEXT = 'Found it.\n\nThe cache was stale.\n\nWant me to clear it?'
const CONTEXTS = {
  on: { threadId: 't', cwd: null, conversational: true },
  off: { threadId: 't', cwd: null, conversational: false }
}

function renderReply(conversational: boolean, streaming: boolean): HTMLElement {
  return render(
    <ChatThreadContext.Provider value={conversational ? CONTEXTS.on : CONTEXTS.off}>
      <ChatReplyBubble text={TEXT} streaming={streaming} />
    </ChatThreadContext.Provider>
  ).container
}

afterEach(() => cleanup())

describe('ChatReplyBubble', () => {
  it('keeps one bubble by default', () => {
    const container = renderReply(false, false)
    expect(container.querySelectorAll('[data-reply-segment]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-chat-reply]')).toHaveLength(1)
  })

  it('splits a conversational reply and plays in only parts that arrive live', () => {
    const settled = renderReply(true, false)
    const parts = settled.querySelectorAll<HTMLElement>('[data-reply-segment]')
    expect(parts).toHaveLength(3)
    expect(parts[2]?.className).not.toContain('animate-in')
    cleanup()
    const live = renderReply(true, true)
    const playing = live.querySelectorAll<HTMLElement>('[data-reply-segment]')
    expect(playing[0]?.className).toContain('animate-in')
    expect(playing[2]?.style.animationDelay).toBe('240ms')
  })
})
