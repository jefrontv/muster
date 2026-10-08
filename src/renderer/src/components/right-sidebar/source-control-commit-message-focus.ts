import { useEffect, type RefObject } from 'react'

const COMMIT_MESSAGE_FOCUS_EVENT = 'muster:source-control-commit-message-focus'
// Why: the panel lazy-mounts after the shortcut, so the request must outlive one frame — but not long enough to steal focus on a later, unrelated mount.
const COMMIT_MESSAGE_FOCUS_TTL_MS = 3000

let pendingFocusRequestAt: number | null = null

export function requestCommitMessageFocus(now = Date.now()): void {
  pendingFocusRequestAt = now
  window.dispatchEvent(new Event(COMMIT_MESSAGE_FOCUS_EVENT))
}

export function hasPendingCommitMessageFocusRequest(now = Date.now()): boolean {
  if (pendingFocusRequestAt === null) {
    return false
  }
  if (now - pendingFocusRequestAt > COMMIT_MESSAGE_FOCUS_TTL_MS) {
    pendingFocusRequestAt = null
    return false
  }
  return true
}

export function clearCommitMessageFocusRequest(): void {
  pendingFocusRequestAt = null
}

export function useCommitMessageFocusRequest(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  canFocus: boolean
): void {
  useEffect(() => {
    let frame: number | null = null
    const tryFocus = (): void => {
      frame = null
      const textarea = textareaRef.current
      if (!textarea || !canFocus || !hasPendingCommitMessageFocusRequest()) {
        return
      }
      textarea.focus()
      if (document.activeElement === textarea) {
        clearCommitMessageFocusRequest()
      }
    }
    // Why: wait a frame so the sidebar open/tab switch has committed before focusing.
    const scheduleFocus = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(tryFocus)
    }
    scheduleFocus()
    window.addEventListener(COMMIT_MESSAGE_FOCUS_EVENT, scheduleFocus)
    return () => {
      window.removeEventListener(COMMIT_MESSAGE_FOCUS_EVENT, scheduleFocus)
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [canFocus, textareaRef])
}
