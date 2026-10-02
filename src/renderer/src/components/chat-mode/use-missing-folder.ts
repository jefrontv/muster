// Flags a chat's workspace folder as gone as soon as the chat opens, before anything launches.

import { useEffect, useState } from 'react'

/** The folder when it doesn't exist; re-checked when the window regains focus. */
export function useMissingFolder(folder: string | null): string | null {
  const [missing, setMissing] = useState<string | null>(null)
  useEffect(() => {
    if (!folder) {
      setMissing(null)
      return
    }
    let cancelled = false
    const check = (): void => {
      void window.api.shell
        .pathExists(folder)
        .then((exists) => (cancelled ? null : setMissing(exists ? null : folder)))
        .catch(() => undefined)
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [folder])
  return missing
}
