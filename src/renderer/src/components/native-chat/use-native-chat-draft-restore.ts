// Composer handle methods for pulling a queued message back into the draft.

import { useCallback, type Dispatch, type SetStateAction } from 'react'

export function useNativeChatDraftRestore(args: {
  draft: string
  imageAttachmentCount: number
  setDraft: (value: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  clearImageAttachments: () => void
  appendImageAttachments: (paths: string[]) => void
  focus: () => boolean
}): {
  hasDraft: () => boolean
  restoreDraft: (text: string, imagePaths: string[]) => void
} {
  const {
    draft,
    imageAttachmentCount,
    setDraft,
    setCaret,
    clearImageAttachments,
    appendImageAttachments,
    focus
  } = args
  const hasDraft = useCallback(
    () => draft.trim() !== '' || imageAttachmentCount > 0,
    [draft, imageAttachmentCount]
  )
  const restoreDraft = useCallback(
    (text: string, imagePaths: string[]) => {
      setDraft(text)
      setCaret(text.length)
      clearImageAttachments()
      appendImageAttachments(imagePaths)
      focus()
    },
    [appendImageAttachments, clearImageAttachments, focus, setCaret, setDraft]
  )
  return { hasDraft, restoreDraft }
}
