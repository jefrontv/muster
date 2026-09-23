import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'

/** Long enough for local repos; short enough that an unreachable SSH host cannot hide a project for good. */
const STARTUP_LIST_SETTLE_FALLBACK_MS = 10_000

/** True once the startup worktree refresh finished, or the fallback ran out, whichever is first. */
export function useStartupWorktreeListsSettled(): boolean {
  const completed = useAppStore((s) => s.startupWorktreeRefreshCompleted)
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (completed) {
      return
    }
    const timer = setTimeout(() => setTimedOut(true), STARTUP_LIST_SETTLE_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [completed])
  return completed || timedOut
}
