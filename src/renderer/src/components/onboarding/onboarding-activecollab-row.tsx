// ActiveCollab connect on the onboarding sources step. The credential dialog
// must sit above the z-100 overlay or it opens behind the sheet.

import { useEffect, useState } from 'react'
import { ActiveCollabConnectDialog } from '@/components/activecollab-connect-dialog'
import { OnboardingActiveCollabMcpInstall } from './onboarding-activecollab-mcp-install'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { cn } from '@/lib/utils'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function ActiveCollabRow(props: { compact?: boolean } = {}): React.JSX.Element {
  const { compact = false } = props
  const settings = useAppStore((s) => s.settings)
  const status = useAppStore((s) => s.activeCollabStatus)
  const statusChecked = useAppStore((s) => s.activeCollabStatusChecked)
  const statusContextKey = useAppStore((s) => s.activeCollabStatusContextKey)
  const checkConnection = useAppStore((s) => s.checkActiveCollabConnection)
  const [dialogOpen, setDialogOpen] = useState(false)

  const statusUnknown =
    !statusChecked || statusContextKey !== getProviderRuntimeContextKey(settings)

  useEffect(() => {
    if (statusUnknown) {
      void checkConnection()
    }
  }, [checkConnection, statusUnknown])

  const checking = statusUnknown
  const connected = status.configured
  const account = status.connection?.userName ?? status.connection?.userEmail ?? null

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className={cn(compact ? 'flex flex-col gap-3 p-4' : 'flex items-start gap-4 p-5')}>
        <div className={cn('flex items-start gap-3', compact ? '' : 'gap-4 flex-1 min-w-0')}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
            <ActiveCollabIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                {translate(
                  'auto.components.onboarding.IntegrationsStep.activecollab',
                  'ActiveCollab'
                )}
              </h3>
              {checking ? (
                <IntegrationStatusPill tone="neutral">
                  {translate('auto.components.onboarding.IntegrationsStep.c1547656f0', 'Checking…')}
                </IntegrationStatusPill>
              ) : connected ? (
                <IntegrationStatusPill tone="connected">
                  {translate('auto.components.onboarding.IntegrationsStep.c91a5782f1', 'Connected')}
                </IntegrationStatusPill>
              ) : (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabNotConnected',
                    'Not connected'
                  )}
                </IntegrationStatusPill>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {connected && account
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabAccount',
                    '{{account}} · Assigned tasks, comments, and notifications.',
                    { account }
                  )
                : translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabDescription',
                    'Assigned tasks, comments, and notifications from your ActiveCollab workspace.'
                  )}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-2', compact ? 'flex-wrap' : 'shrink-0')}>
          {!connected && !checking ? (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              {translate(
                'auto.components.onboarding.IntegrationsStep.activecollabConnect',
                'Connect'
              )}
            </Button>
          ) : null}
        </div>
      </div>
      {connected ? <OnboardingActiveCollabMcpInstall compact={compact} /> : null}
      <ActiveCollabConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => void checkConnection()}
        overlayClassName="z-[120] bg-black/35"
        contentClassName="z-[130]"
      />
    </div>
  )
}
