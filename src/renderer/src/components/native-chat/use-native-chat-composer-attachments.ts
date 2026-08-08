import { useCallback, useRef, useState, type RefObject } from 'react'
import { translate } from '@/i18n/i18n'
import { isNativeChatImageAttachmentPath } from './native-chat-image-paste'
import {
  nativeChatComposerTargetIsRemote,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'
import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

export type UseNativeChatComposerAttachmentsArgs = {
  attachmentScopeKey: string
  /** Stream-transport panes have no PTY target; attachments ride the stream. */
  hasTransport?: boolean
  resolveTarget: () => NativeChatResolvedTarget | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
  setNotice: (notice: string | null) => void
}

export function useNativeChatComposerAttachments({
  attachmentScopeKey,
  hasTransport = false,
  resolveTarget,
  textareaRef,
  setNotice
}: UseNativeChatComposerAttachmentsArgs): {
  imageAttachments: NativeChatComposerImageAttachment[]
  fileAttachments: NativeChatComposerImageAttachment[]
  appendImageAttachments: (paths: string[]) => void
  attachResolvedPaths: (paths: string[]) => void
  clearImageAttachments: () => void
  removeImageAttachment: (id: string) => void
  removeFileAttachment: (id: string) => void
} {
  const [imageAttachments, setImageAttachments] = useState<NativeChatComposerImageAttachment[]>(
    () => readNativeChatAttachmentCache(attachmentScopeKey)
  )
  const [fileAttachments, setFileAttachments] = useState<NativeChatComposerImageAttachment[]>(() =>
    readNativeChatFileAttachmentCache(attachmentScopeKey)
  )
  const imageAttachmentCounter = useRef(0)

  // Reload chips from the cache when the composer is reused for a different pane
  // (scope-key change), adjusting state during render rather than in an effect.
  // Without this the previous pane's chips would stay live and be submitted to
  // the new target now that images are deferred to submit.
  const lastScopeKey = useRef(attachmentScopeKey)
  if (lastScopeKey.current !== attachmentScopeKey) {
    lastScopeKey.current = attachmentScopeKey
    setImageAttachments(readNativeChatAttachmentCache(attachmentScopeKey))
    setFileAttachments(readNativeChatFileAttachmentCache(attachmentScopeKey))
  }

  const updateImageAttachments = useCallback(
    (
      updater: (
        previous: NativeChatComposerImageAttachment[]
      ) => NativeChatComposerImageAttachment[]
    ) => {
      setImageAttachments((prev) => {
        const next = updater(prev)
        writeNativeChatAttachmentCache(attachmentScopeKey, next)
        return next
      })
    },
    [attachmentScopeKey]
  )

  const appendImageAttachments = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return
      }
      updateImageAttachments((prev) => [
        ...prev,
        ...paths.map((path) => {
          imageAttachmentCounter.current += 1
          return { id: `${Date.now()}-${imageAttachmentCounter.current}`, path }
        })
      ])
    },
    [updateImageAttachments]
  )

  const updateFileAttachments = useCallback(
    (
      updater: (
        previous: NativeChatComposerImageAttachment[]
      ) => NativeChatComposerImageAttachment[]
    ) => {
      setFileAttachments((prev) => {
        const next = updater(prev)
        writeNativeChatFileAttachmentCache(attachmentScopeKey, next)
        return next
      })
    },
    [attachmentScopeKey]
  )

  const appendFileAttachments = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return
      }
      updateFileAttachments((prev) => [
        ...prev,
        ...paths
          .filter((path) => !prev.some((attachment) => attachment.path === path))
          .map((path) => {
            imageAttachmentCounter.current += 1
            return { id: `${Date.now()}-${imageAttachmentCounter.current}`, path }
          })
      ])
      setNotice(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [setNotice, textareaRef, updateFileAttachments]
  )

  // Attach paths the TARGET AGENT can read: local paths for local worktrees,
  // already-uploaded remote paths for SSH worktrees (the composer uploads
  // before calling this — see native-chat-attachment-upload.ts).
  const attachResolvedPaths = useCallback(
    (paths: string[]) => {
      // Transport panes send images as base64 blocks over the local stream —
      // there is no PTY target to validate.
      if (!hasTransport) {
        const target = resolveTarget()
        if (!target || nativeChatComposerTargetIsRemote(target.ptyId)) {
          setNotice(
            translate(
              'components.native-chat.composer.localAttachmentUnsupported',
              'Local attachments are not available for remote sessions.'
            )
          )
          return
        }
      }
      const imagePaths = paths.filter(isNativeChatImageAttachmentPath)
      const filePaths = paths.filter((path) => !isNativeChatImageAttachmentPath(path))
      // Neither kind touches the draft here — both render as chips and ride
      // along on submit (files as @-references appended to the outgoing text),
      // so the GUI chips and the input never diverge and removing a chip needs
      // no text surgery.
      appendImageAttachments(imagePaths)
      appendFileAttachments(filePaths)
      if (imagePaths.length > 0) {
        setNotice(null)
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
    },
    [
      appendFileAttachments,
      appendImageAttachments,
      hasTransport,
      resolveTarget,
      setNotice,
      textareaRef
    ]
  )

  return {
    imageAttachments,
    fileAttachments,
    appendImageAttachments,
    attachResolvedPaths,
    // Send-time clear drops both kinds — the message carried them.
    clearImageAttachments: () => {
      updateImageAttachments(() => [])
      updateFileAttachments(() => [])
    },
    removeImageAttachment: (id) =>
      updateImageAttachments((prev) => prev.filter((attachment) => attachment.id !== id)),
    removeFileAttachment: (id) =>
      updateFileAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }
}

const fileAttachmentCache = new Map<string, NativeChatComposerImageAttachment[]>()

function readNativeChatFileAttachmentCache(scopeKey: string): NativeChatComposerImageAttachment[] {
  return [...(fileAttachmentCache.get(scopeKey) ?? [])]
}

function writeNativeChatFileAttachmentCache(
  scopeKey: string,
  attachments: readonly NativeChatComposerImageAttachment[]
): void {
  if (attachments.length === 0) {
    fileAttachmentCache.delete(scopeKey)
    return
  }
  setBoundedScopeCacheEntry(fileAttachmentCache, scopeKey, [...attachments])
}

const attachmentCache = new Map<string, NativeChatComposerImageAttachment[]>()

export function readNativeChatAttachmentCache(
  scopeKey: string
): NativeChatComposerImageAttachment[] {
  return [...(attachmentCache.get(scopeKey) ?? [])]
}

function writeNativeChatAttachmentCache(
  scopeKey: string,
  attachments: readonly NativeChatComposerImageAttachment[]
): void {
  if (attachments.length === 0) {
    attachmentCache.delete(scopeKey)
    return
  }
  // LRU-bounded so pending attachments for permanently-removed panes can't accumulate.
  setBoundedScopeCacheEntry(attachmentCache, scopeKey, [...attachments])
}

export function clearNativeChatAttachmentCacheForTests(): void {
  attachmentCache.clear()
}
