// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatThreadQueuedMessage } from '../../../../shared/chat-thread-stream-types'
import { NativeChatQueueStrip } from './NativeChatQueueStrip'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))

const held = (id: string, text: string, extra: Partial<ChatThreadQueuedMessage> = {}) =>
  ({ id, text, queuedAt: 1, state: 'queued', ...extra }) as ChatThreadQueuedMessage

function renderStrip(
  items: ChatThreadQueuedMessage[],
  options: { paused?: boolean; hasDraft?: boolean } = {}
) {
  const queue = {
    items,
    paused: options.paused ?? false,
    steer: vi.fn(),
    remove: vi.fn(),
    sendNext: vi.fn()
  }
  const restore = vi.fn()
  render(
    <NativeChatQueueStrip
      queue={queue}
      composerHasDraft={() => options.hasDraft ?? false}
      restoreToComposer={restore}
    />
  )
  return { queue, restore }
}

describe('NativeChatQueueStrip', () => {
  it('steers and removes a held message', () => {
    const { queue } = renderStrip([held('m1', 'use tabs')])
    fireEvent.click(screen.getByRole('button', { name: 'Steer: use tabs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove: use tabs' }))
    expect(queue.steer).toHaveBeenCalledWith('m1')
    expect(queue.remove).toHaveBeenCalledWith('m1')
  })

  it('moves a message back into an empty composer, without the image path notes', () => {
    const { queue, restore } = renderStrip([
      held('m1', 'look at this\n[attached image: /tmp/a.png]', { imagePaths: ['/tmp/a.png'] })
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Edit: look at this' }))
    expect(queue.remove).toHaveBeenCalledWith('m1')
    expect(restore).toHaveBeenCalledWith('look at this', ['/tmp/a.png'])
  })

  it('asks before replacing a draft', () => {
    const { restore } = renderStrip([held('m1', 'edit me')], { hasDraft: true })
    fireEvent.click(screen.getByRole('button', { name: 'Edit: edit me' }))
    expect(restore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(restore).toHaveBeenCalledWith('edit me', [])
  })

  it('shows an in-flight steer without actions', () => {
    renderStrip([held('m1', 'now please', { state: 'steering' })])
    expect(screen.getByText('Steering…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Steer: now please' })).toBeNull()
  })

  it('offers Send next when Stop paused the queue', () => {
    const { queue } = renderStrip([held('m1', 'next')], { paused: true })
    fireEvent.click(screen.getByRole('button', { name: 'Send next' }))
    expect(queue.sendNext).toHaveBeenCalled()
  })
})
