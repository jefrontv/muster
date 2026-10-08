import { describe, expect, it } from 'vitest'
import { enqueueGitIndexWrite } from './git-index-write-queue'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('enqueueGitIndexWrite', () => {
  it('runs writes for one worktree one at a time, in order', async () => {
    const events: string[] = []
    const first = deferred()
    const a = enqueueGitIndexWrite('wt-order', async () => {
      events.push('a:start')
      await first.promise
      events.push('a:end')
    })
    const b = enqueueGitIndexWrite('wt-order', async () => {
      events.push('b:start')
    })
    await flush()
    expect(events).toEqual(['a:start'])
    first.resolve()
    await Promise.all([a, b])
    expect(events).toEqual(['a:start', 'a:end', 'b:start'])
  })

  it('keeps going after a failed write and still rejects that caller', async () => {
    const failing = enqueueGitIndexWrite('wt-fail', async () => {
      throw new Error('index.lock exists')
    })
    const next = enqueueGitIndexWrite('wt-fail', async () => 'ok')
    await expect(failing).rejects.toThrow('index.lock exists')
    await expect(next).resolves.toBe('ok')
  })

  it('does not serialize writes across different worktrees', async () => {
    const blocker = deferred()
    const events: string[] = []
    const slow = enqueueGitIndexWrite('wt-one', async () => {
      await blocker.promise
      events.push('one')
    })
    await enqueueGitIndexWrite('wt-two', async () => {
      events.push('two')
    })
    expect(events).toEqual(['two'])
    blocker.resolve()
    await slow
    expect(events).toEqual(['two', 'one'])
  })
})
