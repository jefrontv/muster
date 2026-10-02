import { describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createChatModeSlice } from './chat-mode'

function makeStore() {
  return create<AppState>()(
    (...args) =>
      createChatModeSlice(...(args as Parameters<typeof createChatModeSlice>)) as AppState
  )
}

describe('setChatThreadLastError', () => {
  it('makes no store write when there is no error to clear', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getState()

    store.getState().setChatThreadLastError('t1', null)

    expect(listener).not.toHaveBeenCalled()
    expect(store.getState()).toBe(before)
  })

  it('makes no store write when the same error is set again', () => {
    const store = makeStore()
    store.getState().setChatThreadLastError('t1', 'boom')
    const listener = vi.fn()
    store.subscribe(listener)

    store.getState().setChatThreadLastError('t1', 'boom')

    expect(listener).not.toHaveBeenCalled()
  })

  it('still sets and clears a real error', () => {
    const store = makeStore()
    store.getState().setChatThreadLastError('t1', 'boom')
    expect(store.getState().chatThreadLastError).toEqual({ t1: 'boom' })

    store.getState().setChatThreadLastError('t1', null)
    expect(store.getState().chatThreadLastError).toEqual({})
  })
})
