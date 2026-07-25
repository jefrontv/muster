// The run-history browser: recent runs for the selected site, expanding to the log that was
// persisted on disk, with ocsites' jump-to-first-error (its `e` key) as a button.
//
// It reads `siteRuns:list` / `siteRuns:readLog`, so it works for runs from previous app sessions —
// the point of persisting logs at all. It also refreshes when a live run reaches a terminal state,
// so a run you just watched appears here without a manual reload.

import { History, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { SiteRun, SiteRunEvent } from '../../../../shared/site-run-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { SiteRunHistoryEntry } from './SiteRunHistoryEntry'

const DEFAULT_RUN_LIMIT = 20

type SiteRunHistoryProps = {
  siteId: string
}

export function SiteRunHistory({ siteId }: SiteRunHistoryProps): React.JSX.Element {
  const [runs, setRuns] = useState<SiteRun[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.siteRuns.list({ siteId, limit: DEFAULT_RUN_LIMIT })
      if (result.ok) {
        setRuns(result.value)
        setError(null)
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    setExpandedRunId(null)
    void load()
  }, [load])

  useEffect(() => {
    // Only a terminal status changes what this list shows; log and progress events would refetch
    // the whole list many times a second for nothing.
    return window.api.siteRuns.onEvent((event: SiteRunEvent) => {
      if (event.type === 'status' && event.status !== 'running') {
        void load()
      }
    })
  }, [load])

  const toggle = useCallback((runId: string) => {
    setExpandedRunId((current) => (current === runId ? null : runId))
  }, [])

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <History className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('auto.components.sites.SiteRunHistory.title', 'Run history')}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={loading}
          aria-label={translate(
            'auto.components.sites.SiteRunHistory.refresh',
            'Refresh run history'
          )}
          onClick={() => void load()}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {loading
            ? translate('auto.components.sites.SiteRunHistory.loading', 'Loading run history…')
            : translate(
                'auto.components.sites.SiteRunHistory.empty',
                'No runs recorded for this site yet.'
              )}
        </p>
      ) : (
        <ul className="max-h-96 overflow-y-auto scrollbar-sleek rounded-md border border-border">
          {runs.map((run) => (
            <SiteRunHistoryEntry
              key={run.id}
              run={run}
              expanded={run.id === expandedRunId}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
