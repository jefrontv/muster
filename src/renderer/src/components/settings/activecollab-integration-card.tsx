import { useState } from 'react'
import { Unlink } from 'lucide-react'
import { ActiveCollabConnectDialog } from '@/components/activecollab-connect-dialog'
import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  getProviderRuntimeContextKey,
  hasRemoteProviderRuntime
} from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { translate } from '@/i18n/i18n'

// Why: one ActiveCollab token addresses one instance, so this card shows a single account row
// where the Jira card fans out over sites — there is nothing to add a second of.
export function ActiveCollabIntegrationCard(): React.JSX.Element {
  const activeCollabStatus = useAppStore((s) => s.activeCollabStatus)
  const activeCollabStatusChecked = useAppStore((s) => s.activeCollabStatusChecked)
  const activeCollabStatusContextKey = useAppStore((s) => s.activeCollabStatusContextKey)
  const checkActiveCollabConnection = useAppStore((s) => s.checkActiveCollabConnection)
  const disconnectActiveCollab = useAppStore((s) => s.disconnectActiveCollab)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const contextMatches = activeCollabStatusContextKey === getProviderRuntimeContextKey(settings)
  const checking = !contextMatches || !activeCollabStatusChecked
  const connected = contextMatches && activeCollabStatus.configured
  const connection = contextMatches ? activeCollabStatus.connection : null
  const accountScope = getProviderAccountScope(settings)
  const credentialCopy = hasRemoteProviderRuntime(settings)
    ? translate(
        'auto.components.settings.activecollab.integration.card.credentials_remote',
        'Exchange your ActiveCollab URL, email, and password once for a long-lived token. The password is never stored; the token is held by the selected remote runtime with runtime-supported encryption.'
      )
    : translate(
        'auto.components.settings.activecollab.integration.card.credentials_local',
        'Exchange your ActiveCollab URL, email, and password once for a long-lived token. The password is never stored; the token is kept locally, encrypted when local runtime storage supports it.'
      )
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const accountScopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  const handleDisconnect = async (): Promise<void> => {
    const result = await disconnectActiveCollab()
    if (!mountedRef.current) {
      return
    }
    setDisconnectError(result.ok ? null : describeActiveCollabFailure(result))
  }

  return (
    <IntegrationCardShell
      icon={<ActiveCollabIcon className="size-5" />}
      name="ActiveCollab"
      description={
        connected
          ? translate(
              'auto.components.settings.activecollab.integration.card.connected_description',
              'One instance connected with a stored token.'
            )
          : checking
            ? translate(
                'auto.components.settings.activecollab.integration.card.checking_description',
                'Checking ActiveCollab access before showing setup actions.'
              )
            : translate(
                'auto.components.settings.activecollab.integration.card.description',
                'Browse assigned tasks and start work from ActiveCollab.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={connected ? 'Connected' : 'Not connected'}
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate(
                  'auto.components.settings.activecollab.integration.card.reconnect',
                  'Reconnect'
                )
              : translate(
                  'auto.components.settings.activecollab.integration.card.connect',
                  'Connect ActiveCollab'
                )}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        <ProviderHostScopeControl
          labelPrefix={translate(
            'auto.components.settings.task.tracker.integration.cards.account_scope_prefix',
            'Account scope'
          )}
          scope={accountScope}
          className={accountScopeRowClass}
        />
        {connected ? (
          <div className="space-y-2">
            <div className={subordinateRowClass}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {connection?.userName ??
                    translate(
                      'auto.components.settings.activecollab.integration.card.unknown_account',
                      'Connected account'
                    )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {connection ? `${connection.userEmail} · ${connection.instanceUrl}` : ''}
                </p>
              </div>
              <button
                onClick={() => void handleDisconnect()}
                aria-label={translate(
                  'auto.components.settings.activecollab.integration.card.disconnect_label',
                  'Disconnect ActiveCollab'
                )}
                className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
              >
                <Unlink className="size-3.5" />
              </button>
            </div>
            {disconnectError ? (
              <p role="alert" className="text-xs text-destructive">
                {disconnectError}
              </p>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void checkActiveCollabConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </div>
        ) : !checking ? (
          <>
            {activeCollabStatus.reason ? (
              <p className="text-xs text-muted-foreground">{activeCollabStatus.reason}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{credentialCopy}</p>
            <Button variant="ghost" size="sm" onClick={() => void checkActiveCollabConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <ActiveCollabConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => {
          setDisconnectError(null)
          void checkActiveCollabConnection()
        }}
        overlayClassName="z-[110]"
        contentClassName="z-[120]"
      />
    </IntegrationCardShell>
  )
}
