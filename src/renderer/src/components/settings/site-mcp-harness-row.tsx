import { LoaderCircle } from 'lucide-react'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SiteMcpHarnessStatus } from '../../../../shared/site-mcp-types'
import { describeSiteMcpHarness } from './site-mcp-harness-state'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import type { SiteMcpGlobalNotice } from './use-site-mcp-global-status'

export function SiteMcpHarnessRow({
  harness,
  busy,
  notice,
  blockedReason,
  onInstall
}: {
  harness: SiteMcpHarnessStatus
  busy: boolean
  notice: SiteMcpGlobalNotice | null
  /** Non-null disables the install action and says why (the Site tools toggle is off). */
  blockedReason: string | null
  onInstall: () => void
}): React.JSX.Element {
  const state = describeSiteMcpHarness(harness, blockedReason)
  const rowClass = useIntegrationSubordinateRowClass('space-y-2')

  return (
    <div className={rowClass} data-harness-id={harness.id} data-harness-state={state.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {harness.label}
        </p>
        <IntegrationStatusPill tone={state.tone}>{state.statusLabel}</IntegrationStatusPill>
      </div>
      <p className="text-xs text-muted-foreground">{state.detail}</p>
      <p
        className="truncate font-mono text-[11px] text-muted-foreground/80"
        title={harness.configPath}
      >
        {harness.configPath}
      </p>
      {harness.error ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {harness.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={state.actionVariant}
          size="xs"
          disabled={busy || state.blockedReason !== null}
          title={state.blockedReason ?? undefined}
          onClick={onInstall}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          {state.actionLabel}
        </Button>
        {state.blockedReason ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">{state.blockedReason}</span>
        ) : null}
      </div>
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-xs break-words',
            notice.tone === 'error' ? 'text-destructive' : 'text-status-success'
          )}
        >
          {notice.message}
        </p>
      ) : null}
    </div>
  )
}
