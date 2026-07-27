// Attachment image bytes, fetched once per attachment and held as ready-to-render `data:` URLs.
//
// Deliberately not routed through `runCachedRead`. An attachment's bytes are immutable under its
// id, so a TTL would only buy refetches, and a single inlined screenshot can be hundreds of
// kilobytes — it cannot share the 500-entry budget the row caches use. Concurrency is capped
// because a task with ten screenshots would otherwise open ten authenticated transfers at once.

import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../../../shared/activecollab-api-types'
import { activeCollabGetAttachmentImage } from '@/runtime/runtime-activecollab-client'
import {
  canWriteActiveCollabReadResult,
  currentActiveCollabMutation,
  getActiveCollabReadScope,
  reusableInflightRead,
  scopedCacheKey,
  type ActiveCollabInflightRead,
  type ActiveCollabReadOptions,
  type ActiveCollabStoreGet,
  type ActiveCollabStoreSet
} from './activecollab-cache'

/** About one task's grid plus the task viewed before it. Entries are large; the count stays small. */
export const MAX_CACHED_ATTACHMENT_IMAGES = 16
export const MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES = 3

export type ActiveCollabAttachmentImageState = {
  /** Keyed by scoped attachment id. No TTL: an attachment's bytes never change under its id. */
  activeCollabAttachmentImageCache: Record<string, ActiveCollabAttachmentImage>
}

export type ActiveCollabAttachmentImageActions = {
  /**
   * Resolves from cache when the attachment has already been inlined, joins an in-flight twin
   * otherwise, and only then spends a transfer slot. A failure is never cached, so a retry works.
   */
  fetchActiveCollabAttachmentImage: (
    args: { attachmentId: number },
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabAttachmentImage>>
}

export const EMPTY_ACTIVECOLLAB_ATTACHMENT_IMAGES: ActiveCollabAttachmentImageState = {
  activeCollabAttachmentImageCache: {}
}

type ImageResult = ActiveCollabResult<ActiveCollabAttachmentImage>

const inflight = new Map<string, ActiveCollabInflightRead<ImageResult>>()
const waitingForSlot: (() => void)[] = []
let runningFetches = 0

/** Connect/disconnect: a superseded transfer must not be joined by a caller in the new context. */
export function clearActiveCollabAttachmentImageFetches(): void {
  inflight.clear()
}

async function withTransferSlot(run: () => Promise<ImageResult>): Promise<ImageResult> {
  if (runningFetches >= MAX_CONCURRENT_ATTACHMENT_IMAGE_FETCHES) {
    await new Promise<void>((release) => {
      waitingForSlot.push(release)
    })
  }
  runningFetches += 1
  try {
    return await run()
  } finally {
    runningFetches -= 1
    waitingForSlot.shift()?.()
  }
}

function withNewestImages(
  cache: Record<string, ActiveCollabAttachmentImage>,
  key: string,
  image: ActiveCollabAttachmentImage
): Record<string, ActiveCollabAttachmentImage> {
  const next = { ...cache, [key]: image }
  // Scoped keys are never integer-like, so key order is insertion order and the oldest go first.
  const keys = Object.keys(next)
  for (let i = 0; i < keys.length - MAX_CACHED_ATTACHMENT_IMAGES; i += 1) {
    delete next[keys[i]]
  }
  return next
}

export function createActiveCollabAttachmentImageActions(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet
): ActiveCollabAttachmentImageActions {
  return {
    fetchActiveCollabAttachmentImage: async ({ attachmentId }, options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      const cacheKey = scopedCacheKey(scope, `attachment-image::${attachmentId}`)
      const cached = get().activeCollabAttachmentImageCache[cacheKey]
      if (cached) {
        return { ok: true, value: cached }
      }
      const reusable = reusableInflightRead(inflight, cacheKey, scope.contextKey)
      if (reusable) {
        return reusable
      }

      const generation = currentActiveCollabMutation()
      let entry: ActiveCollabInflightRead<ImageResult>
      const promise = withTransferSlot(() =>
        activeCollabGetAttachmentImage({ attachmentId }, scope.settings)
      )
        .then((result) => {
          if (result.ok && canWriteActiveCollabReadResult(scope, generation, get().settings)) {
            set((s) => ({
              activeCollabAttachmentImageCache: withNewestImages(
                s.activeCollabAttachmentImageCache,
                cacheKey,
                result.value
              )
            }))
          }
          return result
        })
        .catch((error): ImageResult => {
          // The client contract is result-typed, so a rejection here is a transport bug.
          console.warn('[activecollab] attachment image read failed:', error)
          return {
            ok: false,
            kind: 'unknown',
            error: error instanceof Error ? error.message : String(error),
            status: null
          }
        })
        .finally(() => {
          if (inflight.get(cacheKey) === entry) {
            inflight.delete(cacheKey)
          }
        })
      entry = { promise, contextKey: scope.contextKey, mutationGeneration: generation }
      inflight.set(cacheKey, entry)
      return promise
    }
  }
}
