// Bitbucket OAuth lives in this row. A nested Dialog would render at z-50
// behind the z-100 onboarding overlay, so Connect starts the browser flow here.

import { useCallback, useEffect, useRef, useState } from 'react'
import { GitPullRequestArrow, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { BitbucketAuthCredentialStatus } from '../../../../shared/bitbucket-auth-types'

export function BitbucketRow(props: { compact?: boolean } = {}): React.JSX.Element {
  const { compact = false } = props
  const preflightStatus = useAppStore((s) => s.preflightStatus)
  const preflightStatusLoading = useAppStore((s) => s.preflightStatusLoading)
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)
  const [credential, setCredential] = useState<BitbucketAuthCredentialStatus | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connectGeneration = useRef(0)
  const waitingRef = useRef(false)
  waitingRef.current = waiting

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

  useEffect(() => {
    return () => {
      if (waitingRef.current) {
        void window.api.bitbucketAuth?.cancelOAuth?.()
      }
    }
  }, [])

  const checking = preflightStatusLoading || !preflightStatus
  const connected = preflightStatus?.bitbucket?.configured === true
  const account = preflightStatus?.bitbucket?.account ?? null

  const startConnect = async (): Promise<void> => {
    const api = window.api.bitbucketAuth
    if (!api?.beginOAuth) {
      setError(
        translate(
          'auto.components.onboarding.IntegrationsStep.bitbucketRestart',
          'Restart the Muster dev app to load Bitbucket OAuth.'
        )
      )
      return
    }
    if (credential?.oauthAvailable === false) {
      setError(
        translate(
          'auto.components.settings.BitbucketCredentialDialog.oauthMissing',
          'This build has no Bitbucket OAuth consumer. Add ORCA_BITBUCKET_OAUTH_CLIENT_ID and ORCA_BITBUCKET_OAUTH_CLIENT_SECRET, then restart.'
        )
      )
      return
    }
    const generation = connectGeneration.current + 1
    connectGeneration.current = generation
    setWaiting(true)
    setError(null)
    const result = await api.beginOAuth()
    if (generation !== connectGeneration.current) {
      return
    }
    setWaiting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    await syncCredential()
    void refreshPreflightStatus({ force: true })
  }

  const cancelConnect = (): void => {
    connectGeneration.current += 1
    void window.api.bitbucketAuth?.cancelOAuth?.()
    setWaiting(false)
  }

  const description = waiting
    ? translate(
        'auto.components.settings.BitbucketCredentialDialog.oauthWaiting',
        'Finish signing in in your browser. This window waits for Bitbucket to send you back.'
      )
    : error
      ? error
      : connected && account
        ? translate(
            'auto.components.onboarding.IntegrationsStep.bitbucketAccount',
            '{{account}} · Pull requests and build statuses.',
            { account }
          )
        : translate(
            'auto.components.onboarding.IntegrationsStep.bitbucketDescription',
            'Pull requests and build statuses via your Bitbucket account.'
          )

  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <div className={cn(compact ? 'flex flex-col gap-3 p-4' : 'flex items-start gap-4 p-5')}>
        <div className={cn('flex items-start gap-3', compact ? '' : 'gap-4 flex-1 min-w-0')}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
            <GitPullRequestArrow className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold leading-tight text-foreground">
                {translate('auto.components.onboarding.IntegrationsStep.bitbucket', 'Bitbucket')}
              </h3>
              {checking ? (
                <IntegrationStatusPill tone="neutral">
                  {translate('auto.components.onboarding.IntegrationsStep.c1547656f0', 'Checking…')}
                </IntegrationStatusPill>
              ) : waiting ? (
                <IntegrationStatusPill tone="neutral">
                  {translate(
                    'auto.components.settings.BitbucketCredentialDialog.oauthWaitingButton',
                    'Waiting…'
                  )}
                </IntegrationStatusPill>
              ) : connected ? (
                <IntegrationStatusPill tone="connected">
                  {translate('auto.components.onboarding.IntegrationsStep.c91a5782f1', 'Connected')}
                </IntegrationStatusPill>
              ) : (
                <IntegrationStatusPill tone="attention">
                  {translate(
                    'auto.components.onboarding.IntegrationsStep.bitbucketNotConnected',
                    'Not connected'
                  )}
                </IntegrationStatusPill>
              )}
            </div>
            <p
              className={cn(
                'mt-1 text-[13px] leading-relaxed',
                error ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {description}
            </p>
          </div>
        </div>
        <div className={cn('flex items-center gap-2', compact ? 'flex-wrap' : 'shrink-0')}>
          {waiting ? (
            <Button variant="outline" size="sm" onClick={cancelConnect}>
              {translate('auto.components.onboarding.IntegrationsStep.bitbucketCancel', 'Cancel')}
            </Button>
          ) : null}
          {!connected && !checking && !waiting ? (
            <Button variant="outline" size="sm" onClick={() => void startConnect()}>
              {translate('auto.components.onboarding.IntegrationsStep.bitbucketConnect', 'Connect')}
            </Button>
          ) : null}
          {waiting ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="size-3.5 animate-spin" />
              {translate(
                'auto.components.settings.BitbucketCredentialDialog.oauthWaitingButton',
                'Waiting…'
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
