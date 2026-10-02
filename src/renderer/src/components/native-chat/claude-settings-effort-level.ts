// `effortLevel` from the user's Claude settings, for the chat composer's effort label
// when Muster passed no --effort. Re-read on each mount so an edit shows up next time.

import { useEffect, useState } from 'react'

let lastKnown: string | null = null

export function useClaudeSettingsEffortLevel(enabled: boolean): string | null {
  const [level, setLevel] = useState<string | null>(enabled ? lastKnown : null)
  useEffect(() => {
    const read = window.api?.chatMode?.getClaudeSettingsEffort
    if (!enabled || typeof read !== 'function') {
      return
    }
    let cancelled = false
    void read()
      .then((next) => {
        lastKnown = next
        if (!cancelled) {
          setLevel(next)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled])
  return enabled ? level : null
}
