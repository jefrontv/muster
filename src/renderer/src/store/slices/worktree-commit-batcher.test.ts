import { describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createWorktreeCommitBatcher, type ScheduleFlush } from './worktree-commit-batcher'

function makeStore() {
  return create<AppState>()(() => ({ sortEpoch: 0, worktreesByRepo: {} }) as unknown as AppState)
}

function manualSchedule(): { schedule: ScheduleFlush; runFrame: () => void } {
  let pending: (() => void) | null = null
  return {
    schedule: (flush) => {
      pending = flush
      return () => {
        pending = null
      }
    },
    runFrame: () => pending?.()
  }
}

const addRepo = (repoId: string) => (s: AppState) => ({
  worktreesByRepo: { ...s.worktreesByRepo, [repoId]: [] },
  sortEpoch: s.sortEpoch + 1
})

describe('createWorktreeCommitBatcher', () => {
  it('applies every reducer queued in a frame as one write with one sortEpoch bump', () => {
    const store = makeStore()
    const writes = vi.fn()
    store.subscribe(writes)
    const { schedule, runFrame } = manualSchedule()
    const batcher = createWorktreeCommitBatcher(store.setState, schedule)

    batcher.commit(addRepo('a'))
    batcher.commit(addRepo('b'))
    batcher.commit(addRepo('c'))
    expect(writes).not.toHaveBeenCalled()

    runFrame()

    expect(writes).toHaveBeenCalledTimes(1)
    expect(Object.keys(store.getState().worktreesByRepo)).toEqual(['a', 'b', 'c'])
    expect(store.getState().sortEpoch).toBe(1)
  })

  it('flush applies pending work immediately and skips the write when nothing changed', () => {
    const store = makeStore()
    const writes = vi.fn()
    store.subscribe(writes)
    const { schedule } = manualSchedule()
    const batcher = createWorktreeCommitBatcher(store.setState, schedule)

    batcher.commit((s) => s)
    batcher.flush()
    expect(writes).not.toHaveBeenCalled()

    batcher.commit(addRepo('a'))
    batcher.flush()
    expect(writes).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing reducer from the rest of the frame', () => {
    const store = makeStore()
    const { schedule, runFrame } = manualSchedule()
    const batcher = createWorktreeCommitBatcher(store.setState, schedule)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    batcher.commit(addRepo('a'))
    batcher.commit(() => {
      throw new Error('bad repo')
    })
    batcher.commit(addRepo('b'))
    runFrame()

    expect(Object.keys(store.getState().worktreesByRepo)).toEqual(['a', 'b'])
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})
