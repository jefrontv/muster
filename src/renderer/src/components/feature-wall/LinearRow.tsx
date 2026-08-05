import { useState } from 'react'
import { LinearIcon } from '@/components/icons/LinearIcon'
import { Button } from '@/components/ui/button'
import { LinearApiKeyDialog } from '@/components/linear-api-key-dialog'
import { useAppStore } from '@/store'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

// Why: moved out of the onboarding step — onboarding connects ActiveCollab
// now, but the integrations feature wall still surfaces the Linear connect row.
export function LinearRow(props: { compact?: boolean } = {}): React.JSX.Element {
  const { compact = false } = props
  const linearStatus = useAppStore((s) => s.linearStatus)
  const checkLinearConnection = useAppStore((s) => s.checkLinearConnection)

  const [dialogOpen, setDialogOpen] = useState(false)

  const workspaceCount = linearStatus.workspaces?.length ?? (linearStatus.connected ? 1 : 0)

  return (
    <>
      <div className="rounded-xl border border-border bg-muted/20">
        <div className={cn(compact ? 'flex flex-col gap-3 p-4' : 'flex items-start gap-4 p-5')}>
          <div className={cn('flex items-start gap-3', compact ? '' : 'gap-4 flex-1 min-w-0')}>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
              <LinearIcon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                  {translate('auto.components.onboarding.IntegrationsStep.27743304b1', 'Linear')}
                </h3>
                {linearStatus.connected ? (
                  <IntegrationStatusPill tone="connected">
                    {translate(
                      'auto.components.onboarding.IntegrationsStep.c91a5782f1',
                      'Connected'
                    )}
                  </IntegrationStatusPill>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {linearStatus.connected
                  ? translate(
                      'auto.components.onboarding.IntegrationsStep.b08a6ac93c',
                      '{{value0}} workspace{{value1}} linked. Add another workspace or replace a restricted key any time.',
                      { value0: workspaceCount, value1: workspaceCount === 1 ? '' : 's' }
                    )
                  : translate(
                      'auto.components.onboarding.IntegrationsStep.4983ae7433',
                      'Add Linear access with a Personal API key. Full-access keys can show every team the key owner can access.'
                    )}
              </p>
            </div>
          </div>
          <div className={cn('flex items-center gap-2', compact ? 'flex-wrap' : 'shrink-0')}>
            {linearStatus.connected ? (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                {translate(
                  'auto.components.onboarding.IntegrationsStep.dd9c186a8b',
                  'Add workspace access'
                )}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                {translate(
                  'auto.components.onboarding.IntegrationsStep.04ef416712',
                  'Add Linear access'
                )}
              </Button>
            )}
            {!linearStatus.connected ? (
              <Button variant="ghost" size="sm" onClick={() => void checkLinearConnection(true)}>
                {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <LinearApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        overlayClassName="z-[110]"
        contentClassName="z-[120]"
        connectLabel="Add Linear access"
      />
    </>
  )
}
