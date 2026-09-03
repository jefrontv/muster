// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { NativeChatToolStatusIcon, TOOL_TICK_HOLD_MS } from './NativeChatToolStatusIcon'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const tick = (): HTMLElement | null => screen.queryByLabelText('Finished')
const spinner = (): HTMLElement | null => screen.queryByLabelText('Running')

describe('NativeChatToolStatusIcon', () => {
  it('spins while the call is out', () => {
    render(<NativeChatToolStatusIcon status="running" />)
    expect(spinner()).toBeInTheDocument()
    expect(tick()).toBeNull()
  })

  it('shows a tick when the result lands, then falls back to the wrench', () => {
    const { rerender } = render(<NativeChatToolStatusIcon status="running" />)
    rerender(<NativeChatToolStatusIcon status="settled" />)
    expect(tick()).toBeInTheDocument()
    expect(spinner()).toBeNull()

    act(() => {
      vi.advanceTimersByTime(TOOL_TICK_HOLD_MS)
    })
    expect(tick()).toBeNull()
  })

  it('shows no tick for a call that was already finished on mount', () => {
    // Scrollback and reloaded transcripts must not flash ticks for work the
    // user never watched happen.
    render(<NativeChatToolStatusIcon status="settled" />)
    expect(tick()).toBeNull()
    expect(spinner()).toBeNull()
  })

  it('cancels a pending tick when the call starts running again', () => {
    const { rerender } = render(<NativeChatToolStatusIcon status="running" />)
    rerender(<NativeChatToolStatusIcon status="settled" />)
    rerender(<NativeChatToolStatusIcon status="running" />)
    expect(spinner()).toBeInTheDocument()
    expect(tick()).toBeNull()
  })
})
