// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAgentItem } from './chat-subagent-focus'
import type { ChatSubagentFocus } from './use-chat-subagent-focus'

let current: ChatAgentItem | null = null

vi.mock('./use-chat-subagent-focus', () => ({
  useChatEngineAgent: () => (current ? { turnId: 't1', agent: current } : null)
}))
vi.mock('./ChatProcessItems', () => ({
  ChatProcessItems: () => <div data-testid="steps" />
}))

const { ChatSubagentFocusView, SUBAGENT_RETURN_MS } = await import('./ChatSubagentFocusView')

const agent = (status: ChatAgentItem['status']): ChatAgentItem => ({
  kind: 'agent',
  id: 'a1',
  description: 'Scan files',
  subagentType: 'Explore',
  status,
  summary: status === 'running' ? null : 'Found 3 files',
  items: []
})

function setup(stack: ChatSubagentFocus['stack'] = [{ agentId: 'a1', roster: null }]) {
  const focus: ChatSubagentFocus = {
    stack,
    open: vi.fn(),
    openRoster: vi.fn(),
    back: vi.fn(),
    toMain: vi.fn()
  }
  const onReturn = vi.fn()
  const view = render(<ChatSubagentFocusView threadId="th" focus={focus} onReturn={onReturn} />)
  const rerender = (): void =>
    view.rerender(<ChatSubagentFocusView threadId="th" focus={focus} onReturn={onReturn} />)
  return { focus, onReturn, rerender, unmount: view.unmount }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  current = null
})

describe('ChatSubagentFocusView', () => {
  it('goes back from the Back button and the breadcrumb', () => {
    current = agent('running')
    const { focus, onReturn } = setup([
      { agentId: 'a0', roster: null },
      { agentId: 'a1', roster: null }
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(focus.back).toHaveBeenCalledWith(1)
    expect(onReturn).toHaveBeenCalledWith('a1')
    fireEvent.click(screen.getByRole('button', { name: 'Main agent' }))
    expect(focus.toMain).toHaveBeenCalled()
    expect(screen.getByText('Scan files', { selector: '[aria-current="page"]' })).toBeTruthy()
  })

  it('returns on its own once a watched agent finishes', () => {
    current = agent('running')
    const { focus, onReturn, rerender } = setup()
    current = agent('done')
    rerender()
    expect(screen.getByText('Finished')).toBeTruthy()
    expect(screen.getByText('Found 3 files')).toBeTruthy()
    act(() => vi.advanceTimersByTime(SUBAGENT_RETURN_MS))
    expect(focus.back).toHaveBeenCalledTimes(1)
    expect(onReturn).toHaveBeenCalledWith('a1')
  })

  it('holds with a return pill when the user is reading', () => {
    current = agent('running')
    const { focus, rerender } = setup()
    current = agent('done')
    rerender()
    fireEvent.wheel(screen.getByText('Found 3 files'))
    act(() => vi.advanceTimersByTime(SUBAGENT_RETURN_MS))
    expect(focus.back).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Return to main agent' }))
    expect(focus.toMain).toHaveBeenCalled()
  })

  it('stays put on an agent that was already done when opened', () => {
    current = agent('done')
    const { focus } = setup()
    act(() => vi.advanceTimersByTime(SUBAGENT_RETURN_MS * 2))
    expect(focus.back).not.toHaveBeenCalled()
  })

  it('clears the return timer on unmount', () => {
    current = agent('running')
    const { focus, rerender, unmount } = setup()
    current = agent('done')
    rerender()
    unmount()
    act(() => vi.advanceTimersByTime(SUBAGENT_RETURN_MS))
    expect(focus.back).not.toHaveBeenCalled()
  })

  it('explains a roster agent whose steps never reached the stream', () => {
    setup([{ agentId: null, roster: { id: 'h1', description: 'Background scan', startedAt: 0 } }])
    expect(screen.getByText(/aren't streamed/)).toBeTruthy()
    expect(screen.getByText('Background scan', { selector: '[aria-current="page"]' })).toBeTruthy()
  })
})
