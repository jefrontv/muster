import { useCallback, useEffect, useState } from 'react'

// Lets the What's New dialog finish its close animation before this one opens.
const AFTER_WHATS_NEW_MS = 400

export function usePagesIntro(whatsNewSettled: boolean): { open: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.ui
      .get()
      .then((ui) => {
        if (!cancelled) {
          setSeen(ui.pagesIntroSeen === true)
        }
      })
      // An unreadable profile should never nag on every launch.
      .catch(() => {
        if (!cancelled) {
          setSeen(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!whatsNewSettled || seen !== false) {
      return
    }
    const timer = window.setTimeout(() => setOpen(true), AFTER_WHATS_NEW_MS)
    return () => window.clearTimeout(timer)
  }, [whatsNewSettled, seen])

  const dismiss = useCallback((): void => {
    setOpen(false)
    setSeen(true)
    void window.api.ui.set({ pagesIntroSeen: true }).catch(console.error)
  }, [])

  return { open, dismiss }
}
