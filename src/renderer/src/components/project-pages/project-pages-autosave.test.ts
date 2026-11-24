import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageAutosave, type PageSaveResult } from './project-pages-autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(results: PageSaveResult[]) {
  const saves: { patch: unknown; base: number }[] = []
  const states: string[] = []
  const autosave = createPageAutosave({
    revision: 1,
    delayMs: 100,
    save: async (patch, base) => {
      saves.push({ patch, base })
      return results.shift() ?? { ok: true, revision: base + 1 }
    },
    onState: (state) => states.push(state)
  })
  return { autosave, saves, states }
}

describe('page autosave', () => {
  it('debounces edits into one save and reads the body only when saving', async () => {
    const read = vi.fn(() => 'body')
    const { autosave, saves } = setup([])
    autosave.queue({ markdown: () => 'old' })
    autosave.queue({ title: 'T', markdown: read })
    expect(read).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(saves).toEqual([{ patch: { title: 'T', markdown: 'body' }, base: 1 }])
    expect(autosave.revision()).toBe(2)
  })

  it('saves an edit made during a save on top of the new revision', async () => {
    const { autosave, saves } = setup([])
    autosave.queue({ title: 'one' })
    const first = autosave.flush()
    autosave.queue({ title: 'two' })
    await first
    await autosave.flush()
    expect(saves.map((s) => s.base)).toEqual([1, 2])
  })

  it('stops on a conflict, keeps the edit and retries it after resume', async () => {
    const { autosave, saves, states } = setup([{ ok: false, conflict: true, message: 'stale' }])
    autosave.queue({ title: 'mine' })
    await autosave.flush()
    expect(states.at(-1)).toBe('conflict')
    autosave.queue({ markdown: () => 'more' })
    await vi.advanceTimersByTimeAsync(500)
    expect(saves).toHaveLength(1)
    await autosave.resume(5, true)
    expect(saves[1]).toEqual({ patch: { title: 'mine', markdown: 'more' }, base: 5 })
    expect(states.at(-1)).toBe('saved')
  })

  it('drops the edit when the user takes the stored version', async () => {
    const { autosave, saves } = setup([{ ok: false, conflict: true, message: 'stale' }])
    autosave.queue({ title: 'mine' })
    await autosave.flush()
    await autosave.resume(3, false)
    expect(saves).toHaveLength(1)
    expect(autosave.isDirty()).toBe(false)
  })
})
