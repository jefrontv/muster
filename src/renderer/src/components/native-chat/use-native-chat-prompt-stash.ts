// Composer wiring for the prompt stash: the ⌘S/Ctrl+S chord, restore/delete
// actions, and the badge pulse shown when a draft is stashed.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import {
  deletePromptStashEntry,
  readPromptStash,
  restoredPromptDraft,
  stashPrompt,
  type PromptStashEntry
} from './native-chat-prompt-stash'

const PULSE_MS = 700

export type NativeChatPromptStash = {
  entries: PromptStashEntry[]
  /** True briefly after a stash so the badge can pulse. */
  pulse: boolean
  /** Re-read storage (menu open) — another surface may have stashed since. */
  refresh: () => void
  restore: (entry: PromptStashEntry) => void
  remove: (id: string) => void
  /** Returns true when the event was the stash chord and was consumed. */
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
}

export function useNativeChatPromptStash({
  draft,
  setDraft,
  setCaret,
  textareaRef
}: {
  draft: string
  setDraft: (next: string) => void
  setCaret: (caret: number) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}): NativeChatPromptStash {
  const [entries, setEntries] = useState<PromptStashEntry[]>(() => readPromptStash())
  const [pulse, setPulse] = useState(false)
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current)
      }
    },
    []
  )

  const refresh = useCallback(() => setEntries(readPromptStash()), [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      // Never a bare metaKey check: ⌘S on Mac, Ctrl+S elsewhere.
      const modifier = navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey
      if (!modifier || event.shiftKey || event.altKey || event.key.toLowerCase() !== 's') {
        return false
      }
      event.preventDefault()
      if (draft.trim() === '') {
        return true
      }
      setEntries(stashPrompt(draft))
      setDraft('')
      setCaret(0)
      setPulse(true)
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current)
      }
      pulseTimerRef.current = setTimeout(() => setPulse(false), PULSE_MS)
      return true
    },
    [draft, setDraft, setCaret]
  )

  const restore = useCallback(
    (entry: PromptStashEntry) => {
      const next = restoredPromptDraft(draft, entry.text)
      setDraft(next)
      setCaret(next.length)
      const textarea = textareaRef.current
      textarea?.focus()
      requestAnimationFrame(() => textarea?.setSelectionRange(next.length, next.length))
    },
    [draft, setDraft, setCaret, textareaRef]
  )

  const remove = useCallback((id: string) => setEntries(deletePromptStashEntry(id)), [])

  return { entries, pulse, refresh, restore, remove, handleKeyDown }
}
