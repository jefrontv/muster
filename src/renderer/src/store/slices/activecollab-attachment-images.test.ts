import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../../../shared/activecollab-api-types'
import { createActiveCollabSlice } from './activecollab'
import {
  clearActiveCollabAttachmentImageFetches,
  MAX_CACHED_ATTACHMENT_IMAGES,
  MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES
} from './activecollab-attachment-images'

type ImageResult = ActiveCollabResult<ActiveCollabAttachmentImage>

const status = vi.fn()
const disconnect = vi.fn()
const getAttachmentImage = vi.fn<(args: { attachmentId: number }) => Promise<ImageResult>>()

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabStatus: (...args: unknown[]) => status(...args),
  activeCollabConnect: vi.fn(),
  activeCollabDisconnect: (...args: unknown[]) => disconnect(...args),
  activeCollabListAssignedTasks: vi.fn(),
  activeCollabListProjects: vi.fn(),
  activeCollabGetTaskDetail: vi.fn(),
  activeCollabGetAttachmentImage: (args: { attachmentId: number }) => getAttachmentImage(args),
  activeCollabUpdateTask: vi.fn(),
  activeCollabCompleteTask: vi.fn(),
  activeCollabReopenTask: vi.fn(),
  activeCollabPostComment: vi.fn(),
  activeCollabListLabels: vi.fn()
}))

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a)
      }) as AppState
  )
}

function image(attachmentId: number): ActiveCollabAttachmentImage {
  return { dataUrl: `data:image/png;base64,${attachmentId}`, mimeType: 'image/png' }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  // Module-global, so it outlives the per-test store the way it outlives a reconnect.
  clearActiveCollabAttachmentImageFetches()
  getAttachmentImage.mockImplementation(async ({ attachmentId }) => ({
    ok: true,
    value: image(attachmentId)
  }))
  status.mockResolvedValue({ ok: true, value: { configured: false, connection: null, reason: '' } })
  disconnect.mockResolvedValue({
    ok: true,
    value: { configured: false, connection: null, reason: '' }
  })
})

describe('fetchActiveCollabAttachmentImage caching', () => {
  it('serves a second read for the same attachment from cache, so re-selection never refetches', async () => {
    const store = createTestStore()

    const first = await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 249086 })
    const second = await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 249086 })

    expect(first).toEqual({ ok: true, value: image(249086) })
    expect(second).toEqual(first)
    expect(getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('joins an in-flight read instead of opening a second transfer', async () => {
    const store = createTestStore()
    const gate = deferred<ImageResult>()
    getAttachmentImage.mockReturnValue(gate.promise)

    const both = Promise.all([
      store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 7 }),
      store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 7 })
    ])
    gate.resolve({ ok: true, value: image(7) })

    expect(await both).toEqual([
      { ok: true, value: image(7) },
      { ok: true, value: image(7) }
    ])
    expect(getAttachmentImage).toHaveBeenCalledTimes(1)
  })

  it('never caches a failure, so a retry reaches the instance again', async () => {
    const store = createTestStore()
    getAttachmentImage.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'gone',
      status: 404
    })

    await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 3 })
    await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 3 })

    expect(getAttachmentImage).toHaveBeenCalledTimes(2)
    expect(store.getState().activeCollabAttachmentImageCache).toEqual({})
  })

  it('answers a rejected transport as a result rather than throwing at the caller', async () => {
    const store = createTestStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getAttachmentImage.mockRejectedValue(new Error('bridge died'))

    const result = await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 5 })

    expect(result).toEqual({ ok: false, kind: 'unknown', error: 'bridge died', status: null })
    warn.mockRestore()
  })

  it('evicts the oldest images once the budget is passed, keeping the newest', async () => {
    const store = createTestStore()
    const total = MAX_CACHED_ATTACHMENT_IMAGES + 4

    for (let id = 1; id <= total; id += 1) {
      await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: id })
    }

    const keys = Object.keys(store.getState().activeCollabAttachmentImageCache)
    expect(keys).toHaveLength(MAX_CACHED_ATTACHMENT_IMAGES)
    expect(keys.some((key) => key.endsWith('attachment-image::1'))).toBe(false)
    expect(keys.some((key) => key.endsWith(`attachment-image::${total}`))).toBe(true)
  })

  it('drops cached images and joinable transfers on disconnect', async () => {
    const store = createTestStore()
    await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 42 })
    expect(Object.keys(store.getState().activeCollabAttachmentImageCache)).toHaveLength(1)

    await store.getState().disconnectActiveCollab()
    await store.getState().fetchActiveCollabAttachmentImage({ attachmentId: 42 })

    expect(getAttachmentImage).toHaveBeenCalledTimes(2)
  })
})

describe('fetchActiveCollabAttachmentImage concurrency', () => {
  it('caps transfers in flight, so a ten-image grid does not open ten at once', async () => {
    const store = createTestStore()
    const gates: ((value: ImageResult) => void)[] = []
    let peak = 0
    let live = 0
    getAttachmentImage.mockImplementation(({ attachmentId }) => {
      live += 1
      peak = Math.max(peak, live)
      return new Promise<ImageResult>((resolve) => {
        gates.push((value) => {
          live -= 1
          resolve(value)
        })
      }).then((value) => {
        void attachmentId
        return value
      })
    })

    const all = Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        store.getState().fetchActiveCollabAttachmentImage({ attachmentId: index + 1 })
      )
    )
    // Let every queued caller settle into either a slot or the wait list.
    await Promise.resolve()
    expect(peak).toBe(MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES)
    expect(getAttachmentImage).toHaveBeenCalledTimes(MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES)

    while (gates.length > 0) {
      gates.shift()?.({ ok: true, value: image(0) })
      await Promise.resolve()
      await Promise.resolve()
    }
    await all

    expect(getAttachmentImage).toHaveBeenCalledTimes(10)
    expect(peak).toBe(MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES)
  })
})
