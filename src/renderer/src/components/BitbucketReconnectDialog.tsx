// App-wide prompt for a saved Bitbucket sign-in that stopped working. Main dedupes and decides
// when to ask; this only renders the current loss and runs the same OAuth flow as Settings.

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type {
  BitbucketAuthLoss,
  BitbucketAuthLossReason
} from '../../../shared/bitbucket-auth-types'

function lossReasonText(reason: BitbucketAuthLossReason): string {
  switch (reason) {
    case 'refresh-rejected':
      return translate(
        'auto.components.BitbucketReconnectDialog.refreshRejected',
        'Bitbucket refused to renew the saved sign-in. Access may have been revoked, or the sign-in expired.'
      )
    case 'token-rejected':
      return translate(
        'auto.components.BitbucketReconnectDialog.tokenRejected',
        'Bitbucket rejected the saved sign-in (HTTP 401). It may have expired or been revoked.'
      )
    case 'keychain-unreadable':
      return translate(
        'auto.components.BitbucketReconnectDialog.keychainUnreadable',
        'Muster could not read the saved sign-in from your OS keychain. Keychain access may have been denied.'
      )
  }
}

export function BitbucketReconnectDialog(): React.JSX.Element {
  const refreshPreflightStatus = useAppStore((s) => s.refreshPreflightStatus)
  const [loss, setLoss] = useState<BitbucketAuthLoss | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconnectRef = useRef<HTMLButtonElement>(null)
  const connectGeneration = useRef(0)

  useEffect(() => {
    const api = window.api.bitbucketAuth
    if (!api?.onLossChanged) {
      return undefined
    }
    let active = true
    const apply = (next: BitbucketAuthLoss | null | undefined): void => {
      if (!active) {
        return
      }
      setLoss(next ?? null)
      if (!next) {
        setWaiting(false)
        setError(null)
      }
    }
    // Subscribe before reading so a loss detected in between is not missed.
    const unsubscribe = api.onLossChanged(apply)
    void Promise.resolve(api.pendingLoss?.())
      .then(apply)
      .catch(() => undefined)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const reconnect = async (): Promise<void> => {
    const generation = connectGeneration.current + 1
    connectGeneration.current = generation
    setWaiting(true)
    setError(null)
    try {
      const result = await window.api.bitbucketAuth.beginOAuth()
      if (generation !== connectGeneration.current) {
        return
      }
      setWaiting(false)
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Main clears the loss on success, which closes this dialog in every window.
      void refreshPreflightStatus({ force: true })
    } catch (caught) {
      if (generation !== connectGeneration.current) {
        return
      }
      setWaiting(false)
      setError(
        caught instanceof Error
          ? caught.message
          : translate(
              'auto.components.BitbucketReconnectDialog.connectFailed',
              'Bitbucket sign-in failed. Try again.'
            )
      )
    }
  }

  const notNow = (): void => {
    if (waiting) {
      connectGeneration.current += 1
      void window.api.bitbucketAuth.cancelOAuth()
    }
    setLoss(null)
    setWaiting(false)
    setError(null)
    void window.api.bitbucketAuth.dismissLoss()
  }

  return (
    <Dialog
      open={loss !== null}
      onOpenChange={(open) => {
        if (!open) {
          notNow()
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          reconnectRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.BitbucketReconnectDialog.title', 'Reconnect Bitbucket')}
          </DialogTitle>
          <DialogDescription>{loss ? lossReasonText(loss.reason) : null}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {waiting
            ? translate(
                'auto.components.settings.BitbucketCredentialDialog.oauthWaiting',
                'Finish signing in in your browser. This window waits for Bitbucket to send you back.'
              )
            : translate(
                'auto.components.BitbucketReconnectDialog.impact',
                'Bitbucket pull requests and build statuses will not load until you reconnect.'
              )}
        </p>

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={notNow}>
            {translate('auto.components.BitbucketReconnectDialog.notNow', 'Not now')}
          </Button>
          <Button ref={reconnectRef} disabled={waiting} onClick={() => void reconnect()}>
            {waiting ? <Loader2 className="size-4 animate-spin" /> : null}
            {waiting
              ? translate(
                  'auto.components.settings.BitbucketCredentialDialog.oauthWaitingButton',
                  'Waiting…'
                )
              : translate(
                  'auto.components.settings.BitbucketCredentialDialog.reconnect',
                  'Reconnect'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
