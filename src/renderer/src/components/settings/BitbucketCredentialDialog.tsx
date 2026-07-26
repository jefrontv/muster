import { useLayoutEffect, useState } from 'react'
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
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { translate } from '@/i18n/i18n'
import type { BitbucketAuthCredentialStatus } from '../../../../shared/bitbucket-auth-types'

type BitbucketCredentialDialogProps = {
  open: boolean
  status: BitbucketAuthCredentialStatus | null
  onOpenChange: (open: boolean) => void
  /** Resolves to an error message, or null on success. */
  onSave: (input: { email: string; apiToken: string }) => Promise<string | null>
  onClear: () => Promise<void>
}

export function BitbucketCredentialDialog({
  open,
  status,
  onOpenChange,
  onSave,
  onClear
}: BitbucketCredentialDialogProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Why layout effect: clear the secret before the dialog paints, so reopening never shows a token
  // left in state from a previous session. The email is prefilled because it is not a secret.
  useLayoutEffect(() => {
    if (open) {
      setApiToken('')
      setEmail(status?.email ?? '')
      setError(null)
    }
  }, [open, status?.email])

  const canSubmit = email.trim().length > 0 && apiToken.trim().length > 0 && !pending

  const save = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setPending(true)
    const message = await onSave({ email: email.trim(), apiToken: apiToken.trim() })
    setPending(false)
    if (message) {
      setError(message)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.BitbucketCredentialDialog.title', 'Bitbucket')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.description',
              'Your Atlassian account email and an API token. Used to read pull requests and build statuses.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bitbucket-email">
            {translate('auto.components.settings.BitbucketCredentialDialog.email', 'Email')}
          </Label>
          <Input
            id="bitbucket-email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            placeholder={translate(
              'auto.components.settings.BitbucketCredentialDialog.emailPlaceholder',
              'you@example.com'
            )}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bitbucket-api-token">
            {translate('auto.components.settings.BitbucketCredentialDialog.token', 'API token')}
          </Label>
          <Input
            id="bitbucket-api-token"
            type="password"
            autoComplete="off"
            value={apiToken}
            placeholder={
              status?.configured
                ? translate(
                    'auto.components.settings.BitbucketCredentialDialog.tokenSet',
                    'Token saved — enter a new one to replace it'
                  )
                : translate(
                    'auto.components.settings.BitbucketCredentialDialog.tokenPlaceholder',
                    'ATATT...'
                  )
            }
            disabled={pending}
            onChange={(event) => setApiToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void save()
              }
            }}
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Lock className="size-3 shrink-0" />
          {translate(
            'auto.components.settings.BitbucketCredentialDialog.storage',
            'Stored in your OS keychain via Electron encrypted storage. Never written in plain text.'
          )}
        </p>

        <DialogFooter>
          {status?.configured ? (
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
          <Button disabled={!canSubmit} onClick={() => void save()}>
            {pending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
            {translate('auto.components.settings.BitbucketCredentialDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
