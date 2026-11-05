import React from 'react'
import { AlertCircle, LoaderCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

/** Replaces the detection skeleton once the first check runs long or fails, so it never spins forever. */
export function SiteStackDetectionNotice({
  failure,
  onRetry
}: {
  /** null while the check is only slow; a string (possibly empty) once it failed. */
  failure: string | null
  onRetry: () => void
}): React.JSX.Element {
  const failed = failure !== null
  return (
    <div role="status" className="space-y-2 rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle className="size-3.5 shrink-0 text-status-danger" />
        ) : (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 text-foreground">
          {failed
            ? translate(
                'auto.components.sites.SiteStackDetectionNotice.failed',
                "Couldn't check the Local site."
              )
            : translate(
                'auto.components.sites.SiteStackDetectionNotice.slow',
                'Still checking the Local site…'
              )}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
          <RotateCw />
          {translate('auto.components.sites.SiteStackDetectionNotice.retry', 'Retry')}
        </Button>
      </div>
      {failed && failure ? (
        <p className="break-words font-mono text-[11px] text-muted-foreground">{failure}</p>
      ) : null}
    </div>
  )
}
