// Starts the bots server when the Bots tab first mounts and tracks its state.
import { useCallback, useEffect, useState } from 'react'
import type { BotsSidecarStatus } from '../../../../shared/bots-types'

export function useBotsStatus(): { status: BotsSidecarStatus; restart: () => void } {
  const [status, setStatus] = useState<BotsSidecarStatus>({ state: 'starting' })

  useEffect(() => {
    let live = true
    const off = window.api.bots.onStatusChanged((next) => {
      if (live) {
        setStatus(next)
      }
    })
    void window.api.bots
      .start()
      .then((next) => {
        if (live) {
          setStatus(next)
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setStatus({
            state: 'failed',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })
    return () => {
      live = false
      off()
    }
  }, [])

  const restart = useCallback(() => {
    setStatus({ state: 'starting' })
    void window.api.bots.restart().then(setStatus)
  }, [])

  return { status, restart }
}
