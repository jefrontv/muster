import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransferProgressReporter, withProgressHeartbeat } from './site-mcp-progress'

afterEach(() => {
  vi.useRealTimers()
})

describe('withProgressHeartbeat', () => {
  it('passes through when context.progress is absent', async () => {
    const result = await withProgressHeartbeat({}, 'SSH command', async () => 'done')
    expect(result).toBe('done')
  })

  it('emits initial progress and periodic heartbeats until resolved, then clears timer', async () => {
    vi.useFakeTimers()
    const updates: { progress: number; message: string }[] = []
    const { promise, resolve } = Promise.withResolvers<string>()

    const running = withProgressHeartbeat(
      { progress: (entry) => updates.push(entry) },
      'Remote WP-CLI',
      () => promise,
      5_000
    )
    expect(updates).toEqual([{ progress: 0, message: 'Remote WP-CLI' }])

    await vi.advanceTimersByTimeAsync(11_000)
    expect(updates.map((entry) => entry.progress)).toEqual([0, 1, 2])
    expect(updates[2]!.message).toContain('Remote WP-CLI (10s)')

    resolve('ok')
    expect(await running).toBe('ok')

    const countBefore = updates.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(updates).toHaveLength(countBefore)
  })
})

describe('createTransferProgressReporter', () => {
  it('throttles intermediate progress ticks and always reports completion', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const updates: { progress: number; message: string }[] = []
    const onProgress = createTransferProgressReporter(
      { progress: (entry) => updates.push(entry) },
      'Uploading a.zip',
      2_000
    )

    onProgress(100, 1_000)
    vi.advanceTimersByTime(500)
    onProgress(500, 1_000)
    vi.advanceTimersByTime(2_000)
    onProgress(750, 1_000)
    vi.advanceTimersByTime(100)
    onProgress(1_000, 1_000)

    expect(updates.map((entry) => entry.message)).toEqual([
      'Uploading a.zip (10%)',
      'Uploading a.zip (75%)',
      'Uploading a.zip (100%)'
    ])
  })
})
