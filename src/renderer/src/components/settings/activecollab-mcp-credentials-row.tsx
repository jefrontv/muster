import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ActiveCollabMcpNoticeText } from './activecollab-mcp-notice'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import type { ActiveCollabMcpNotice } from './use-activecollab-mcp-status'

/** The path is always on screen: this action puts a token on disk, so it should never be implicit. */
export function ActiveCollabMcpCredentialsRow({
  credentialsPath,
  seeded,
  busy,
  notice,
  onSeed
}: {
  credentialsPath: string
  seeded: boolean
  busy: boolean
  notice: ActiveCollabMcpNotice | null
  onSeed: () => void
}): React.JSX.Element {
  const rowClass = useIntegrationSubordinateRowClass('space-y-2')

  return (
    <div className={rowClass} data-testid="activecollab-mcp-credentials">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {translate(
            'auto.components.settings.activecollab.mcp.credentials_label',
            'Server credentials'
          )}
        </p>
        <IntegrationStatusPill tone={seeded ? 'connected' : 'attention'}>
          {seeded
            ? translate(
                'auto.components.settings.activecollab.mcp.credentials_written',
                'File written'
              )
            : translate(
                'auto.components.settings.activecollab.mcp.credentials_absent',
                'No file yet'
              )}
        </IntegrationStatusPill>
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.activecollab.mcp.credentials_help',
          'This writes your ActiveCollab token to a file on disk, readable only by your user account, so the MCP server can authenticate without a second login.'
        )}
      </p>
      <p
        className="truncate font-mono text-[11px] text-muted-foreground/80"
        title={credentialsPath}
      >
        {credentialsPath}
      </p>
      <Button
        type="button"
        size="xs"
        variant={seeded ? 'outline' : 'default'}
        disabled={busy}
        onClick={onSeed}
      >
        {seeded
          ? translate(
              'auto.components.settings.activecollab.mcp.credentials_rewrite',
              'Rewrite credential file'
            )
          : translate(
              'auto.components.settings.activecollab.mcp.credentials_write',
              'Write credential file'
            )}
      </Button>
      {notice ? <ActiveCollabMcpNoticeText notice={notice} /> : null}
    </div>
  )
}
