import { CircleStop, DownloadCloud, Loader2, UploadCloud } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import type { SiteRunGroup, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { cn } from '@/lib/utils'
import { useSiteRun } from './use-site-run'

type SiteRunConsoleProps = {
  summary: SiteSummary
}

export function SiteRunConsole({ summary }: SiteRunConsoleProps): React.JSX.Element {
  const { run, lines, progress, starting, error, start, cancel } = useSiteRun(summary.site.id)
  const confirm = useConfirmationDialog()
  const logRef = useRef<HTMLDivElement | null>(null)
  const running = run?.status === 'running'

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines.length])

  const requestRun = async (group: SiteRunGroup): Promise<void> => {
    const target = summary.resolvedEnvironment.environment
    // The branch guard: an unmatched branch must never silently deploy to production.
    if (summary.resolvedEnvironment.requiresConfirmation) {
      const accepted = await confirm({
        title: translate('auto.components.sites.SiteRunConsole.confirmTitle', 'Confirm target'),
        description: translate(
          'auto.components.sites.SiteRunConsole.confirmBody',
          'Branch {{branch}} does not match an environment. This run would target {{environment}}. Continue?',
          { branch: summary.branch ?? '—', environment: target ?? '—' }
        ),
        confirmLabel: translate('auto.components.sites.SiteRunConsole.confirmRun', 'Run anyway'),
        confirmVariant: 'destructive'
      })
      if (!accepted) {
        return
      }
    }
    await start(group, target ?? undefined)
  }

  const selectedCount =
    run?.group === 'deploy' ? summary.deploySelectedCount : summary.importSelectedCount

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={running || starting || summary.importSelectedCount === 0}
          onClick={() => void requestRun('import')}
        >
          <DownloadCloud className="size-3.5" />
          {translate('auto.components.sites.SiteRunConsole.import', 'Import')}
          <Badge variant="secondary">{summary.importSelectedCount}</Badge>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={running || starting || summary.deploySelectedCount === 0}
          onClick={() => void requestRun('deploy')}
        >
          <UploadCloud className="size-3.5" />
          {translate('auto.components.sites.SiteRunConsole.deploy', 'Deploy')}
          <Badge variant="secondary">{summary.deploySelectedCount}</Badge>
        </Button>
        {running ? (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void cancel()}>
            <CircleStop className="size-3.5" />
            {translate('auto.components.sites.SiteRunConsole.cancel', 'Cancel')}
          </Button>
        ) : null}
        {starting || running ? <Loader2 className="size-4 animate-spin" /> : null}
        {run ? (
          <span className="text-xs text-muted-foreground">
            {run.group} · {run.environment} · {run.status}
            {selectedCount > 0 ? ` · ${selectedCount}` : ''}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {progress ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{progress.stage}</span>
            {progress.percent === null ? null : <span>{progress.percent}%</span>}
          </div>
          <Progress value={progress.percent ?? 0} />
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div
          ref={logRef}
          className="max-h-64 overflow-y-auto scrollbar-sleek rounded-md bg-muted/40 p-3 font-mono text-xs"
        >
          {lines.map((line, index) => (
            <div
              key={`${line.at}-${index}`}
              className={cn(
                'whitespace-pre-wrap break-words',
                line.level === 'error' && 'text-destructive',
                line.level === 'status' && 'font-medium'
              )}
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
