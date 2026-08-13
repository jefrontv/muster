import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, GitPullRequestArrow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'
import { BitbucketCredentialDialog } from './BitbucketCredentialDialog'
import type { BitbucketAuthCredentialStatus } from '../../../../shared/bitbucket-auth-types'
import { translate } from '@/i18n/i18n'

export function BitbucketIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('bitbucket')
  const status = unavailable ? 'unavailable' : statuses.bitbucketStatus
  const connected = status === 'connected'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [credential, setCredential] = useState<BitbucketAuthCredentialStatus | null>(null)

  const syncCredential = useCallback(async (): Promise<void> => {
    const api = window.api.bitbucketAuth
    if (!api) {
      return
    }
    setCredential(await api.status())
  }, [])

  useEffect(() => {
    void syncCredential()
  }, [syncCredential])

  // Why: the credential lives on the machine running the app. On a remote runtime the preflight
  // probe resolves against that host's keychain, so a locally saved token would not apply.
  const editable = !unavailable && !credential?.fromEnvironment

  return (
    <IntegrationCardShell
      icon={<GitPullRequestArrow className="size-5" />}
      name="Bitbucket"
      description={
        connected
          ? statuses.bitbucketAccount
            ? translate(
                'auto.components.settings.token.source.control.integration.cards.ea204f5e03',
                '{{value0}} · Pull requests and build statuses',
                { value0: statuses.bitbucketAccount }
              )
            : translate(
                'auto.components.settings.token.source.control.integration.cards.0fa5629dad',
                'Pull requests and build statuses'
              )
          : translate(
              'auto.components.settings.token.source.control.integration.cards.a924e8dcd1',
              'Pull requests and build statuses via your Bitbucket account.'
            )
      }
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={
        connected
          ? 'Connected'
          : status === 'unavailable'
            ? 'Unavailable'
            : status === 'not-configured'
              ? 'Not configured'
              : 'Auth failed'
      }
    >
      {status !== 'checking' ? (
        <IntegrationCardDetails>
          <p className="text-xs text-muted-foreground">
            {status === 'unavailable'
              ? translate(
                  'auto.components.settings.token.source.control.integration.cards.24ac1c69dc',
                  'Bitbucket status is not available in this runtime yet.'
                )
              : credential?.fromEnvironment
                ? translate(
                    'auto.components.settings.token.source.control.integration.cards.fromEnv',
                    'Credentials come from environment variables, which take priority over anything saved here.'
                  )
                : status === 'not-configured'
                  ? translate(
                      'auto.components.settings.token.source.control.integration.cards.needsSetup',
                      'Connect with your Bitbucket account in the browser.'
                    )
                  : connected
                    ? translate(
                        'auto.components.settings.token.source.control.integration.cards.connected',
                        'Credentials are saved in your OS keychain.'
                      )
                    : translate(
                        'auto.components.settings.token.source.control.integration.cards.authFailed',
                        'Saved credentials could not authenticate. Check the token and its repository permissions.'
                      )}
          </p>
          <div className="flex items-center gap-2">
            {editable ? (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                {connected
                  ? translate(
                      'auto.components.settings.token.source.control.integration.cards.change',
                      'Change credentials'
                    )
                  : translate(
                      'auto.components.settings.token.source.control.integration.cards.connect',
                      'Connect'
                    )}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                window.api.shell.openUrl(
                  'https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/'
                )
              }
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              {translate(
                'auto.components.settings.token.source.control.integration.cards.1a9475dace',
                'Learn more'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh}>
              {translate(
                'auto.components.settings.token.source.control.integration.cards.793a06e899',
                'Re-check'
              )}
            </Button>
          </div>
          <BitbucketCredentialDialog
            open={dialogOpen}
            status={credential}
            onOpenChange={setDialogOpen}
            onConnect={async () => {
              const api = window.api.bitbucketAuth
              if (!api?.beginOAuth) {
                return 'Restart the Muster dev app to load Bitbucket OAuth.'
              }
              const result = await api.beginOAuth()
              if ('error' in result) {
                return result.error
              }
              await syncCredential()
              refresh()
              return null
            }}
            onCancelConnect={() => {
              void window.api.bitbucketAuth?.cancelOAuth?.()
            }}
            onClear={async () => {
              await window.api.bitbucketAuth.clear()
              await syncCredential()
              refresh()
            }}
          />
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}

export function AzureDevOpsIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('azureDevOps')
  const status = unavailable ? 'unavailable' : statuses.azureDevOpsStatus
  const configured = status === 'configured'

  return (
    <IntegrationCardShell
      icon={<GitPullRequestArrow className="size-5" />}
      name="Azure DevOps"
      description={
        configured
          ? statuses.azureDevOpsAccount
            ? translate(
                'auto.components.settings.token.source.control.integration.cards.ea204f5e03',
                '{{value0}} · Pull requests and build statuses',
                { value0: statuses.azureDevOpsAccount }
              )
            : statuses.azureDevOpsBaseUrl
              ? translate(
                  'auto.components.settings.token.source.control.integration.cards.ea204f5e03',
                  '{{value0}} · Pull requests and build statuses',
                  { value0: statuses.azureDevOpsBaseUrl }
                )
              : translate(
                  'auto.components.settings.token.source.control.integration.cards.54636c65d4',
                  'Pull requests and build statuses for detected Azure Repos'
                )
          : translate(
              'auto.components.settings.token.source.control.integration.cards.0eb50d5593',
              'Pull requests and build statuses via Azure DevOps REST API tokens.'
            )
      }
      checking={status === 'checking'}
      statusTone={configured ? 'connected' : 'attention'}
      statusLabel={
        configured
          ? statuses.azureDevOpsAccount
            ? 'Connected'
            : 'Configured'
          : status === 'unavailable'
            ? 'Unavailable'
            : status === 'not-configured'
              ? 'Not configured'
              : 'Auth failed'
      }
    >
      {status !== 'checking' && !configured ? (
        <IntegrationCardDetails>
          <p className="text-xs text-muted-foreground">
            {status === 'unavailable' ? (
              translate(
                'auto.components.settings.token.source.control.integration.cards.f3f47dc7de',
                'Azure DevOps status is not available in this runtime yet.'
              )
            ) : status === 'not-configured' ? (
              <>
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.7bbc9c64f0',
                  'Set'
                )}{' '}
                <span className="font-mono text-[11px]">
                  {translate(
                    'auto.components.settings.token.source.control.integration.cards.48842720d2',
                    'ORCA_AZURE_DEVOPS_TOKEN'
                  )}
                </span>
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.087feb92f1',
                  ', or set'
                )}{' '}
                <span className="font-mono text-[11px]">
                  {translate(
                    'auto.components.settings.token.source.control.integration.cards.fbfd237f5e',
                    'ORCA_AZURE_DEVOPS_ACCESS_TOKEN'
                  )}
                </span>
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.b8a10b07c1',
                  '. Set'
                )}{' '}
                <span className="font-mono text-[11px]">
                  {translate(
                    'auto.components.settings.token.source.control.integration.cards.186a6689df',
                    'ORCA_AZURE_DEVOPS_API_BASE_URL'
                  )}
                </span>{' '}
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.7bd345e3f6',
                  'only when Muster cannot derive the API base URL from the git remote.'
                )}
              </>
            ) : (
              translate(
                'auto.components.settings.token.source.control.integration.cards.40f678df73',
                'Azure DevOps credentials are configured but could not authenticate. Check the token, API base URL, and repository permissions, then restart Muster if environment variables changed.'
              )
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.api.shell.openUrl(
                  status === 'not-configured'
                    ? 'https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate'
                    : 'https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests'
                )
              }
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              {translate(
                'auto.components.settings.token.source.control.integration.cards.1a9475dace',
                'Learn more'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh}>
              {translate(
                'auto.components.settings.token.source.control.integration.cards.793a06e899',
                'Re-check'
              )}
            </Button>
          </div>
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}

export function GiteaIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('gitea')
  const status = unavailable ? 'unavailable' : statuses.giteaStatus
  const configured = status === 'configured'

  return (
    <IntegrationCardShell
      icon={<GitPullRequestArrow className="size-5" />}
      name="Gitea"
      description={
        configured
          ? statuses.giteaAccount
            ? translate(
                'auto.components.settings.token.source.control.integration.cards.0b5242f8a2',
                '{{value0}} · Pull requests and commit statuses',
                { value0: statuses.giteaAccount }
              )
            : statuses.giteaBaseUrl
              ? translate(
                  'auto.components.settings.token.source.control.integration.cards.0b5242f8a2',
                  '{{value0}} · Pull requests and commit statuses',
                  { value0: statuses.giteaBaseUrl }
                )
              : translate(
                  'auto.components.settings.token.source.control.integration.cards.52f75876be',
                  'Pull requests and commit statuses for detected repositories'
                )
          : translate(
              'auto.components.settings.token.source.control.integration.cards.05863d2599',
              'Pull requests and commit statuses via the Gitea REST API.'
            )
      }
      checking={status === 'checking'}
      statusTone={configured ? 'connected' : 'attention'}
      statusLabel={
        configured
          ? statuses.giteaAccount
            ? 'Connected'
            : 'Configured'
          : status === 'unavailable'
            ? 'Unavailable'
            : status === 'not-configured'
              ? 'Optional setup'
              : 'Auth failed'
      }
    >
      {status !== 'checking' && !configured ? (
        <IntegrationCardDetails>
          <p className="text-xs text-muted-foreground">
            {status === 'unavailable' ? (
              translate(
                'auto.components.settings.token.source.control.integration.cards.0613928cb3',
                'Gitea status is not available in this runtime yet.'
              )
            ) : status === 'not-configured' ? (
              <>
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.fcbe0469fd',
                  'Public repositories are detected from their git remote. Set'
                )}{' '}
                <span className="font-mono text-[11px]">
                  {translate(
                    'auto.components.settings.token.source.control.integration.cards.6d5c2a3005',
                    'ORCA_GITEA_TOKEN'
                  )}
                </span>{' '}
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.6da9dfa5de',
                  'for private repositories, and set'
                )}{' '}
                <span className="font-mono text-[11px]">
                  {translate(
                    'auto.components.settings.token.source.control.integration.cards.709057ad91',
                    'ORCA_GITEA_API_BASE_URL'
                  )}
                </span>{' '}
                {translate(
                  'auto.components.settings.token.source.control.integration.cards.60708f23da',
                  'only when Muster cannot derive the API URL from the remote.'
                )}
              </>
            ) : (
              translate(
                'auto.components.settings.token.source.control.integration.cards.19fb419c12',
                'Gitea credentials are configured but could not authenticate. Check the token, API base URL, and repository permissions, then restart Muster if environment variables changed.'
              )
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.api.shell.openUrl('https://docs.gitea.com/next/development/api-usage')
              }
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              {translate(
                'auto.components.settings.token.source.control.integration.cards.1a9475dace',
                'Learn more'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh}>
              {translate(
                'auto.components.settings.token.source.control.integration.cards.793a06e899',
                'Re-check'
              )}
            </Button>
          </div>
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}
