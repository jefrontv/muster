// Adding files to a waiting draft from the editor: the picker, a native drop, or a pasted image.
// Each lands on the draft straight away; the panel's change event brings the new list back.
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { activeCollabPickCommentAttachments } from '@/runtime/runtime-activecollab-client'
import type {
  BotsCommentDraft,
  BotsCommentDraftAttachment,
  BotsCommentDraftResult
} from '../../../../shared/bots-comment-draft-types'
import {
  hasNativeFileDragTypes,
  NATIVE_FILE_DROP_TARGET
} from '../../../../shared/native-file-drop'
import { describeBotsCommentDraftFailure } from './bots-comment-draft-failure-message'

const PASTE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

function base64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

export function useBotsDraftAttachmentAdding(draft: BotsCommentDraft) {
  const mounted = useMountedRef()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = draft.id

  const run = useCallback(
    async (call: () => Promise<BotsCommentDraftResult<unknown> | null>) => {
      setBusy(true)
      setError(null)
      try {
        const result = await call()
        if (mounted.current && result && !result.ok) {
          setError(describeBotsCommentDraftFailure(result))
        }
      } catch (failure) {
        if (mounted.current) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      } finally {
        if (mounted.current) {
          setBusy(false)
        }
      }
    },
    [mounted]
  )

  const addPaths = useCallback(
    (paths: string[]) =>
      paths.length === 0
        ? Promise.resolve(null)
        : window.api.bots.addCommentDraftAttachments({ id, paths }),
    [id]
  )

  useEffect(
    () =>
      window.api.ui.onFileDrop((payload) => {
        if (payload.target !== NATIVE_FILE_DROP_TARGET.botsCommentDraft) {
          return
        }
        setDragging(false)
        void run(() => addPaths(payload.paths))
      }),
    [addPaths, run]
  )

  useEffect(() => {
    // The drop router swallows the drop before React sees it, so the highlight clears here.
    const clear = (): void => setDragging(false)
    document.addEventListener('drop', clear, true)
    document.addEventListener('dragend', clear, true)
    return () => {
      document.removeEventListener('drop', clear, true)
      document.removeEventListener('dragend', clear, true)
    }
  }, [])

  const pick = useCallback(() => {
    void run(async () => {
      const picked = await activeCollabPickCommentAttachments()
      if (!picked.ok) {
        setError(picked.error)
        return null
      }
      return addPaths(picked.value.map((file) => file.path))
    })
  }, [addPaths, run])

  const onPaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      const images = [...event.clipboardData.files].filter((file) => PASTE_TYPES[file.type])
      if (images.length === 0) {
        return
      }
      event.preventDefault()
      void run(async () => {
        let last: BotsCommentDraftResult<BotsCommentDraft> | null = null
        for (const [index, image] of images.entries()) {
          const name =
            image.name && image.name !== 'image.png'
              ? image.name
              : `pasted-${Date.now()}${index ? `-${index}` : ''}.${PASTE_TYPES[image.type]}`
          last = await window.api.bots.addCommentDraftImage({
            id,
            name,
            dataBase64: await base64(image)
          })
          if (!last.ok) {
            return last
          }
        }
        return last
      })
    },
    [id, run]
  )

  const remove = useCallback(
    (file: BotsCommentDraftAttachment) =>
      void run(() => window.api.bots.removeCommentDraftAttachment({ id, attachmentId: file.id })),
    [id, run]
  )

  return {
    busy,
    dragging,
    error,
    pick,
    onPaste,
    remove,
    dropTargetProps: {
      'data-native-file-drop-target': NATIVE_FILE_DROP_TARGET.botsCommentDraft,
      onDragOver: (event: React.DragEvent<HTMLElement>) => {
        if (hasNativeFileDragTypes(event.dataTransfer.types)) {
          setDragging(true)
        }
      },
      onDragLeave: (event: React.DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }
    }
  }
}
