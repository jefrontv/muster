// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEngineItem } from '../../../../shared/chat-engine-types'
import { ChatTurnPresence } from './ChatTurnPresence'

const read: ChatEngineItem = {
  kind: 'tool',
  id: 'r1',
  name: 'Read',
  input: { file_path: '/site/notes.txt' },
  status: 'done'
}
const bash: ChatEngineItem = {
  kind: 'tool',
  id: 'b1',
  name: 'Bash',
  input: { command: 'ls', description: 'List files' },
  status: 'running'
}

const nowText = (container: HTMLElement): string =>
  container.querySelector('[data-turn-now]')?.textContent ?? ''

describe('ChatTurnPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows the lead word, the timer and the live step', () => {
    const { container } = render(
      <ChatTurnPresence turn={{ id: 't', items: [read, bash], startedAt: 0 }} />
    )
    expect(container.textContent).toContain('Working')
    expect(container.textContent).toContain('10s')
    expect(nowText(container)).toBe('List files')
    expect(container.querySelector('[data-turn-now]')?.getAttribute('title')).toBe('ls')
  })

  it('rotates phrases while thinking and restarts at the lead for a new step', () => {
    const { container, rerender } = render(
      <ChatTurnPresence turn={{ id: 't', items: [], startedAt: 10_000 }} />
    )
    expect(nowText(container)).toBe('Thinking')
    act(() => {
      vi.advanceTimersByTime(6001)
    })
    expect(nowText(container)).not.toBe('Thinking')
    rerender(<ChatTurnPresence turn={{ id: 't', items: [bash], startedAt: 10_000 }} />)
    expect(nowText(container)).toBe('List files')
  })

  it('opens the recent steps and folds them with Escape', () => {
    const { container, getByRole } = render(
      <ChatTurnPresence turn={{ id: 't', items: [read, bash], startedAt: 10_000 }} />
    )
    const toggle = getByRole('button', { name: 'Recent steps' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('li')).toBeNull()
  })

  it('leaves no timers behind once it unmounts', () => {
    const { unmount } = render(
      <ChatTurnPresence turn={{ id: 't', items: [], startedAt: 10_000 }} />
    )
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
