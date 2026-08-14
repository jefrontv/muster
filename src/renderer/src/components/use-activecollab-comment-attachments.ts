// The files staged beneath the ActiveCollab comment composer: picked or dropped, described from
// disk so a row can show a real size, and uploaded as one batch when the comment is posted.
//
// Upload happens ON POST, never on attach, and that ordering is the whole safety story. ActiveCollab
// mints an upload code first and the comment quotes it second, so the codes cannot exist before the
// post; and because nothing is sent until the author hits the button, a refused upload leaves the
// typed comment and every staged row exactly where they were.
//
// Drops arrive through the preload drop router rather than a React `onDrop`. That router already
// swallows the browser default — the Electron footgun where a stray file drop navigates the window
// to `file:///…` and takes the whole session with it — and addresses each gesture to the marked
// element it landed on, so a drop anywhere else in the app never reaches this composer.

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import {
  activeCollabDescribeCommentAttachments,
  activeCollabPickCommentAttachments,
  activeCollabUploadCommentAttachments
} from '@/runtime/runtime-activecollab-client'
import type {
  ActiveCollabResult,
  ActiveCollabStagedFile
} from '../../../shared/activecollab-api-types'
import { hasNativeFileDragTypes, NATIVE_FILE_DROP_TARGET } from '../../../shared/native-file-drop'

export type ActiveCollabCommentAttachments = {
  files: ActiveCollabStagedFile[]
  /** True while the picker, a describe or the upload is in flight. Posting waits on it. */
  busy: boolean
  /** A staged file that can never be uploaded; posting is refused until it is removed. */
  blocked: boolean
  error: string | null
  /** True while a native file drag is over the composer. */
  dragging: boolean
  /** Spread on the composer root: marks the drop target and drives the highlight. */
  dropTargetProps: {
    'data-native-file-drop-target': string
    onDragOver: (event: React.DragEvent<HTMLElement>) => void
    onDragLeave: (event: React.DragEvent<HTMLElement>) => void
  }
  pick: () => void
  remove: (path: string) => void
  clear: () => void
  /**
   * Uploads everything staged and answers the codes in order, or NULL when the instance refused.
   * Null is the caller's instruction to post nothing and leave the draft alone.
   */
  upload: () => Promise<string[] | null>
  /**
   * The one outcome nothing below the composer can see: the files reached the instance but the
   * comment did not, so they are uploaded and attached to nothing.
   */
  reportOrphanedUpload: () => void
}

/** The two surfaces that stage ActiveCollab uploads; each owns its own drop target so a drop on
 *  the create dialog never also stages in the composer mounted behind it. */
type ActiveCollabUploadDropTarget =
  | typeof NATIVE_FILE_DROP_TARGET.activeCollabComment
  | typeof NATIVE_FILE_DROP_TARGET.activeCollabTaskCreate

export function useActiveCollabCommentAttachments(options?: {
  dropTarget?: ActiveCollabUploadDropTarget
  /** Overrides the "uploaded but attached to nothing" wording for non-comment hosts. */
  orphanMessage?: string
}): ActiveCollabCommentAttachments {
  const dropTarget = options?.dropTarget ?? NATIVE_FILE_DROP_TARGET.activeCollabComment
  const orphanMessage = options?.orphanMessage
  const mountedRef = useMountedRef()
  const [files, setFiles] = useState<ActiveCollabStagedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared by all three calls so a failure can never leave the strip stuck busy or silently wrong.
  const run = useCallback(
    async <T>(call: () => Promise<ActiveCollabResult<T>>): Promise<T | null> => {
      setBusy(true)
      setError(null)
      try {
        const result = await call()
        if (!mountedRef.current) {
          return null
        }
        if (!result.ok) {
          setError(result.error)
          return null
        }
        return result.value
      } finally {
        if (mountedRef.current) {
          setBusy(false)
        }
      }
    },
    [mountedRef]
  )

  const stage = useCallback((staged: readonly ActiveCollabStagedFile[]) => {
    // Deduped on path: the same file attached twice uploads twice and posts two copies of itself.
    setFiles((current) => [
      ...current,
      ...staged.filter((file) => !current.some((held) => held.path === file.path))
    ])
  }, [])

  useEffect(
    () =>
      window.api.ui.onFileDrop((payload) => {
        if (payload.target !== dropTarget) {
          return
        }
        setDragging(false)
        void (async () => {
          const staged = await run(() =>
            activeCollabDescribeCommentAttachments({ paths: payload.paths })
          )
          if (staged !== null) {
            stage(staged)
          }
        })()
      }),
    [dropTarget, run, stage]
  )

  useEffect(() => {
    // The drop router stops propagation before React sees the drop, so the highlight has to be
    // cleared from the same capture phase the gesture is swallowed in.
    const clear = (): void => setDragging(false)
    document.addEventListener('drop', clear, true)
    document.addEventListener('dragend', clear, true)
    return () => {
      document.removeEventListener('drop', clear, true)
      document.removeEventListener('dragend', clear, true)
    }
  }, [])

  const pick = useCallback(() => {
    void (async () => {
      const staged = await run(activeCollabPickCommentAttachments)
      if (staged !== null) {
        stage(staged)
      }
    })()
  }, [run, stage])

  const upload = useCallback(async (): Promise<string[] | null> => {
    if (files.length === 0) {
      return []
    }
    const uploaded = await run(() =>
      activeCollabUploadCommentAttachments({ paths: files.map((file) => file.path) })
    )
    return uploaded === null ? null : uploaded.map((file) => file.code)
  }, [files, run])

  const reportOrphanedUpload = useCallback(() => {
    setError(
      orphanMessage ??
        translate(
          'auto.components.activecollab.comment_attachments.orphaned_upload',
          'The files uploaded but the comment did not post, so nothing was attached. Your comment is still here — try again.'
        )
    )
  }, [orphanMessage])

  return {
    files,
    busy,
    blocked: files.some((file) => file.rejected !== null),
    error,
    dragging,
    dropTargetProps: {
      'data-native-file-drop-target': dropTarget,
      onDragOver: (event) => {
        if (hasNativeFileDragTypes(event.dataTransfer.types)) {
          setDragging(true)
        }
      },
      onDragLeave: (event) => {
        // Moving between children fires a leave whose related target is still inside.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }
    },
    pick,
    remove: useCallback((path: string) => {
      setFiles((current) => current.filter((file) => file.path !== path))
    }, []),
    clear: useCallback(() => {
      setFiles([])
      setError(null)
    }, []),
    upload,
    reportOrphanedUpload
  }
}
