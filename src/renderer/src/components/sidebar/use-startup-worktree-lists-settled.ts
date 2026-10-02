import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'

/** Short enough that an unreachable SSH host cannot hide its projects for long. */
const REMOTE_SETTLE_FALLBACK_MS = 10_000
/** Local lists always arrive, but 200+ repos take well over 10s; this only guards a hung git. */
const LOCAL_SETTLE_FALLBACK_MS = 60_000

/** Whether startup still hides unloaded remote and local projects; each side has its own fallback. */
export function useStartupWorktreeListsSettled(): { remote: boolean; local: boolean } {
  const completed = useAppStore((s) => s.startupWorktreeRefreshCompleted)
  const [remoteTimedOut, setRemoteTimedOut] = useState(false)
  const [localTimedOut, setLocalTimedOut] = useState(false)
  useEffect(() => {
    if (completed) {
      return
    }
    const remote = setTimeout(() => setRemoteTimedOut(true), REMOTE_SETTLE_FALLBACK_MS)
    const local = setTimeout(() => setLocalTimedOut(true), LOCAL_SETTLE_FALLBACK_MS)
    return () => {
      clearTimeout(remote)
      clearTimeout(local)
    }
  }, [completed])
  return { remote: completed || remoteTimedOut, local: completed || localTimedOut }
}
