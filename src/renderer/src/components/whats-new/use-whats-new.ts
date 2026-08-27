// Asks main once per launch whether this launch follows an update, and owns
// the dismiss handshake. Kept separate from the modal so App.tsx just mounts
// <WhatsNewModal .../> and the gating logic stays testable here.

import { useCallback, useEffect, useState } from 'react'
import type { WhatsNewPayload } from '../../../../shared/whats-new'

type WhatsNewState =
  | { phase: 'idle' }
  | { phase: 'unavailable' }
  | { phase: 'ready'; payload: WhatsNewPayload }

export function useWhatsNew(): {
  payload: WhatsNewPayload | null
  ready: boolean
  dismiss: () => void
} {
  const [state, setState] = useState<WhatsNewState>({ phase: 'idle' })

  useEffect(() => {
    let cancelled = false
    void window.api.whatsNew
      .get()
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.status === 'ready') {
          setState({ phase: 'ready', payload: result.payload })
        } else {
          setState({ phase: 'unavailable' })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ phase: 'unavailable' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = useCallback((): void => {
    // Why: record seen first — if the component unmounts mid-close the
    // version is still recorded and the modal won't re-offer next launch.
    void window.api.whatsNew.dismiss()
    setState({ phase: 'unavailable' })
  }, [])

  return {
    payload: state.phase === 'ready' ? state.payload : null,
    ready: state.phase === 'ready',
    dismiss
  }
}
