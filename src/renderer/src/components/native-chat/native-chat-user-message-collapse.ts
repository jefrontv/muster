// Long user prompts render collapsed behind a fade so a pasted wall of text
// doesn't dominate the transcript. Pure so the threshold is unit-testable.

export const NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_LINES = 8
export const NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_CHARS = 600

// Mask (not an overlay) so the fade tracks the bubble's own fill color.
export const NATIVE_CHAT_USER_MESSAGE_FADE_MASK =
  'linear-gradient(to bottom, black calc(100% - 1.75rem), transparent)'

/** True when a user message is long enough to render collapsed. */
export function shouldCollapseUserMessage(text: string): boolean {
  if (text.trim().length === 0) {
    return false
  }
  return (
    text.length > NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_CHARS ||
    text.split('\n').length > NATIVE_CHAT_USER_MESSAGE_COLLAPSE_MAX_LINES
  )
}
