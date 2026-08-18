import { Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'
import { appendCloneLogLine, SiteCloneLog } from './SiteCloneLog'

type CloneProgress = { phase: string; percent: number }

/**
 * The cloning step's live surface. Mounted for exactly the cloning step, so its progress and log
 * state reset on each run, and its subscriptions attach before git spawns (the same guarantee the
 * old dialog-level listener had, now scoped to this step).
 */
export function SiteCloneStep({
  destinationPath,
  cloneError
}: {
  destinationPath: string
  cloneError: string
}): React.JSX.Element {
  const strings = getSiteCloneSourceStrings()
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [cloneLog, setCloneLog] = useState<string[]>([])

  useEffect(() => {
    const offProgress = window.api.repos.onCloneProgress((data) => setProgress(data))
    const offLog = window.api.repos.onCloneLog((data) => {
      setCloneLog((prev) => appendCloneLogLine(prev, data.line))
    })
    return () => {
      offProgress()
      offLog()
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {cloneError.length === 0 ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
        <span className="truncate">
          {cloneError.length > 0
            ? cloneError
            : progress
              ? `${progress.phase} ${progress.percent}%`
              : strings.cloneStarting}
        </span>
      </div>
      {cloneError.length === 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
          />
        </div>
      ) : null}
      {cloneError.length === 0 ? <SiteCloneLog lines={cloneLog} /> : null}
      <p className="break-all font-mono text-[11px] text-muted-foreground/70">{destinationPath}</p>
    </div>
  )
}
