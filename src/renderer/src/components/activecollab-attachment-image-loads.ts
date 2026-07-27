// One load per attachment id, owned by the grid rather than by each thumbnail.
//
// The lightbox shows an image the grid already inlined, so the bytes have to be reachable from
// above the thumbnail. Lifting them here also means a task that lists the same attachment twice
// loads it once, and `startedIds` keeps a re-render or a StrictMode double-effect from re-entering
// the store action at all.

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'

export type ActiveCollabAttachmentImageState =
  | { status: 'loading' }
  | { status: 'ready'; dataUrl: string }
  | { status: 'failed'; failure: ActiveCollabFailure }

const LOADING: ActiveCollabAttachmentImageState = { status: 'loading' }

export type ActiveCollabAttachmentImageLoads = {
  stateFor: (attachmentId: number) => ActiveCollabAttachmentImageState
  retry: (attachmentId: number) => void
}

export function useActiveCollabAttachmentImageLoads(
  attachmentIds: number[]
): ActiveCollabAttachmentImageLoads {
  const fetchImage = useAppStore((s) => s.fetchActiveCollabAttachmentImage)
  const [loads, setLoads] = useState<Record<number, ActiveCollabAttachmentImageState>>({})
  const startedIds = useRef(new Set<number>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    (attachmentId: number) => {
      startedIds.current.add(attachmentId)
      void fetchImage({ attachmentId }).then((result) => {
        if (!mounted.current) {
          return
        }
        setLoads((previous) => ({
          ...previous,
          [attachmentId]: result.ok
            ? { status: 'ready', dataUrl: result.value.dataUrl }
            : { status: 'failed', failure: result }
        }))
      })
    },
    [fetchImage]
  )

  // A joined key, not the array, because the caller rebuilds the array on every render.
  const idsKey = attachmentIds.join(',')
  useEffect(() => {
    for (const rawId of idsKey.split(',')) {
      const attachmentId = Number(rawId)
      if (rawId !== '' && !startedIds.current.has(attachmentId)) {
        load(attachmentId)
      }
    }
  }, [idsKey, load])

  const stateFor = useCallback(
    (attachmentId: number): ActiveCollabAttachmentImageState => loads[attachmentId] ?? LOADING,
    [loads]
  )
  // The slice only caches successes, so a retry reaches the instance again.
  const retry = useCallback(
    (attachmentId: number) => {
      setLoads((previous) => ({ ...previous, [attachmentId]: LOADING }))
      load(attachmentId)
    },
    [load]
  )

  return { stateFor, retry }
}
