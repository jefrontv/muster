// Live dictation for plain text controls: each streaming partial replaces the
// in-flight segment in place, so words appear (and self-correct) as the user
// speaks. Terminals and contenteditable keep the insert-on-final path — their
// writes are not safely replaceable.

import { pasteTextIntoTextControl } from '@/lib/text-control-paste'

export type DictationLiveInserter = {
  /** Queue the newest partial; stale intermediates are skipped. */
  applyPartial: (text: string) => void
  /** Replace the live segment with the final text and start a fresh segment
   *  after it (streaming models emit one final per utterance). */
  applyFinal: (text: string) => void
  /** True once the target was abandoned (blur, edit inside the segment,
   *  detach) — the caller should fall back to insert-on-final. */
  isAbandoned: () => boolean
  cancel: () => void
}

type LiveSegment = { start: number; end: number; lastText: string }

export function createDictationLiveInserter(
  element: HTMLInputElement | HTMLTextAreaElement
): DictationLiveInserter {
  let segment: LiveSegment | null = null
  let abandoned = false
  let applying = false
  /** Latest requested text; null = nothing pending. Finals win over partials. */
  let pending: { text: string; final: boolean } | null = null

  const abandon = (): void => {
    abandoned = true
    pending = null
    segment = null
  }

  const targetUsable = (): boolean =>
    element.isConnected && element.ownerDocument.activeElement === element

  const applyOnce = async (text: string, final: boolean): Promise<void> => {
    if (!targetUsable()) {
      abandon()
      return
    }
    if (segment) {
      // The user typed inside the live segment (or moved it): stop rewriting.
      if (element.value.slice(segment.start, segment.end) !== segment.lastText) {
        abandon()
        return
      }
      element.setSelectionRange(segment.start, segment.end)
    }
    const start = segment?.start ?? element.selectionStart ?? element.value.length
    if (!segment) {
      // Collapse any user selection so the paste replaces nothing but itself.
      element.setSelectionRange(start, element.selectionEnd ?? start)
    }
    await pasteTextIntoTextControl(element, text, {
      source: 'programmatic',
      inputType: 'insertText',
      canContinue: (candidate) => candidate.ownerDocument.activeElement === candidate
    }).catch(() => abandon())
    if (abandoned) {
      return
    }
    segment = final ? null : { start, end: start + text.length, lastText: text }
  }

  const drain = async (): Promise<void> => {
    if (applying) {
      return
    }
    applying = true
    try {
      while (pending && !abandoned) {
        const next = pending
        pending = null
        await applyOnce(next.text, next.final)
      }
    } finally {
      applying = false
    }
  }

  return {
    applyPartial: (text) => {
      if (abandoned || text === '') {
        return
      }
      // A queued final must not be downgraded by a late partial.
      if (!pending?.final) {
        pending = { text, final: false }
      }
      void drain()
    },
    applyFinal: (text) => {
      if (abandoned) {
        return
      }
      pending = { text, final: true }
      void drain()
    },
    isAbandoned: () => abandoned,
    cancel: abandon
  }
}
