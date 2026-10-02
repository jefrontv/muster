// Whether any agent on this computer has the muster-sites server, for the setup guide's
// "Give your agents site tools" step. Re-read on focus: the install happens in onboarding or Settings.

import { useEffect, useState } from 'react'

export function useSiteToolsInstalled(enabled: boolean): boolean {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }
    let disposed = false
    const probe = (): void => {
      void (async () => {
        const result = await window.api.siteMcp?.globalStatus().catch(() => null)
        if (!disposed && result?.ok) {
          setInstalled(
            result.value.harnesses.some((harness) => harness.configured && harness.current)
          )
        }
      })()
    }
    probe()
    window.addEventListener('focus', probe)
    return () => {
      disposed = true
      window.removeEventListener('focus', probe)
    }
  }, [enabled])

  return installed
}
