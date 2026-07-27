import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabMcpBinary } from '../../../../shared/activecollab-mcp-types'
import {
  useIntegrationCommandRowClass,
  useIntegrationSubordinateRowClass
} from './integration-card-presentation'

/** A missing binary is a detour, not a dead end: the row hands over the exact install command. */
export function ActiveCollabMcpBinaryRow({
  binary
}: {
  binary: ActiveCollabMcpBinary
}): React.JSX.Element {
  const rowClass = useIntegrationSubordinateRowClass('space-y-2')
  const commandRowClass = useIntegrationCommandRowClass()

  const copyInstallHint = async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(binary.installHint)
      toast.success(
        translate('auto.components.settings.activecollab.mcp.copied_hint', 'Copied command.')
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.activecollab.mcp.copy_failed',
              'Failed to copy command.'
            )
      )
    }
  }

  return (
    <div className={rowClass} data-testid="activecollab-mcp-binary">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {translate(
            'auto.components.settings.activecollab.mcp.binary_label',
            'activecollab-mcp server'
          )}
        </p>
        <IntegrationStatusPill tone={binary.found ? 'connected' : 'attention'}>
          {binary.found
            ? (binary.version ??
              translate('auto.components.settings.activecollab.mcp.binary_found', 'Installed'))
            : translate(
                'auto.components.settings.activecollab.mcp.binary_missing',
                'Not installed'
              )}
        </IntegrationStatusPill>
      </div>
      {binary.found ? (
        <p
          className="truncate font-mono text-[11px] text-muted-foreground/80"
          title={binary.path ?? undefined}
        >
          {binary.path}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.activecollab.mcp.binary_missing_help',
              'Install the server, then re-check. Agents that reach it over HTTP can still be configured now.'
            )}
          </p>
          <div className={commandRowClass}>
            <code className="scrollbar-sleek min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
              {binary.installHint}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              aria-label={translate(
                'auto.components.settings.activecollab.mcp.copy_hint_label',
                'Copy install command'
              )}
              onClick={() => void copyInstallHint()}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
