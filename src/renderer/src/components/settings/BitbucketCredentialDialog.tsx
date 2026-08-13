import { useEffect, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { translate } from '@/i18n/i18n'
import type { BitbucketAuthCredentialStatus } from '../../../../shared/bitbucket-auth-types'

type BitbucketCredentialDialogProps = {
  open: boolean
  status: BitbucketAuthCredentialStatus | null
  onOpenChange: (open: boolean) => void
  onConnect: () => Promise<string | null>
  onCancelConnect: () => void
  onClear: () => Promise<void>
}

export function BitbucketCredentialDialog({
  open,
  status,
  onOpenChange,
  onConnect,
  onCancelConnect,
  onClear
}: BitbucketCredentialDialogProps): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPending(false)
      setError(null)
    }
  }, [open])

  const connect = async (): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      const message = await onConnect()
      setPending(false)
      if (message) {
        setError(message)
        return
      }
      onOpenChange(false)
    } catch (caught) {
      setPending(false)
      setError(
        caught instanceof Error
          ? caught.message
          : 'Bitbucket sign-in failed. Restart the Muster dev app and try again.'
      )
    }
  }

  const close = (): void => {
    if (pending) {
      onCancelConnect()
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.BitbucketCredentialDialog.title', 'Bitbucket')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.oauthDescription',
              'Sign in with your Bitbucket account to read pull requests and build statuses.'
            )}
          </DialogDescription>
        </DialogHeader>

        {status?.fromEnvironment ? (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.fromEnv',
              'Credentials come from environment variables, so this form cannot change them.'
            )}
          </p>
        ) : status?.oauthAvailable === false ? (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.oauthMissing',
              'This build has no Bitbucket OAuth consumer. Add ORCA_BITBUCKET_OAUTH_CLIENT_ID and ORCA_BITBUCKET_OAUTH_CLIENT_SECRET, then restart.'
            )}
          </p>
        ) : pending ? (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.oauthWaiting',
              'Finish signing in in your browser. This window waits for Bitbucket to send you back.'
            )}
          </p>
        ) : status?.configured ? (
          <p className="text-sm text-muted-foreground">
            {status.account
              ? translate(
                  'auto.components.settings.BitbucketCredentialDialog.oauthConnectedAs',
                  'Connected as {{account}}.',
                  { account: status.account }
                )
              : translate(
                  'auto.components.settings.BitbucketCredentialDialog.oauthConnected',
                  'Bitbucket is connected on this machine.'
                )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.oauthReady',
              'Muster will open Bitbucket in your browser. Approve access, then come back here.'
            )}
          </p>
        )}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Lock className="size-3 shrink-0" />
          {translate(
            'auto.components.settings.BitbucketCredentialDialog.storage',
            'Stored in your OS keychain via Electron encrypted storage. Never written in plain text.'
          )}
        </p>

        <DialogFooter>
          {status?.configured && !status.fromEnvironment ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                void (async () => {
                  setPending(true)
                  await onClear()
                  setPending(false)
                  onOpenChange(false)
                })()
              }}
            >
              {translate(
                'auto.components.settings.BitbucketCredentialDialog.disconnect',
                'Disconnect'
              )}
            </Button>
          ) : null}
          <Button
            disabled={pending || status?.fromEnvironment || status?.oauthAvailable === false}
            onClick={() => void connect()}
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
            {pending
              ? translate(
                  'auto.components.settings.BitbucketCredentialDialog.oauthWaitingButton',
                  'Waiting…'
                )
              : status?.configured
                ? translate(
                    'auto.components.settings.BitbucketCredentialDialog.reconnect',
                    'Reconnect'
                  )
                : translate(
                    'auto.components.settings.BitbucketCredentialDialog.connect',
                    'Continue in Bitbucket'
                  )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
