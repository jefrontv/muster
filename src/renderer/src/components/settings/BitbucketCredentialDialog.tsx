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
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { BitbucketAuthCredentialStatus } from '../../../../shared/bitbucket-auth-types'

/**
 * The minimum token scopes for the three endpoints the client calls: `/user` (auth probe),
 * `/repositories/…/pullrequests`, and `/repositories/…/commit/…/statuses/build`.
 *
 * Names are Atlassian API token scopes, not the legacy App Password checkbox labels. An App
 * Password needs the equivalent Account: Read, Repositories: Read, Pull requests: Read.
 */
// Why a catalog getter rather than a plain const: module-scope translate() runs at import time,
// so the English strings would be frozen into the bundle before a locale is chosen and would
// never refresh after a language change. createLocalizedCatalog re-builds per active locale.
const getBitbucketRequiredScopes = createLocalizedCatalog(
  (): readonly { name: string; reason: string }[] => [
    {
      name: 'read:user:bitbucket',
      reason: translate(
        'auto.components.settings.BitbucketCredentialDialog.scopeUser',
        'Confirms the token works and shows the connected account.'
      )
    },
    {
      name: 'read:repository:bitbucket',
      reason: translate(
        'auto.components.settings.BitbucketCredentialDialog.scopeRepository',
        'Resolves the repository and reads commit build statuses.'
      )
    },
    {
      name: 'read:pullrequest:bitbucket',
      reason: translate(
        'auto.components.settings.BitbucketCredentialDialog.scopePullRequest',
        'Reads pull requests for the current branch.'
      )
    }
  ]
)

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

        {/* Why list these: an API token created with no scopes still authenticates against /user,
            so the card would read "Connected" while every pull-request lookup returned empty.
            Scope names verified against Atlassian's API token permissions reference. */}
        <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
          <p className="text-[11px] font-medium">
            {translate(
              'auto.components.settings.BitbucketCredentialDialog.scopesTitle',
              'Select these permissions when creating the token'
            )}
          </p>
          <ul className="mt-1.5 space-y-1">
            {getBitbucketRequiredScopes().map((scope) => (
              <li key={scope.name} className="flex gap-2 text-[11px] text-muted-foreground">
                <code className="shrink-0 font-mono text-foreground/80">{scope.name}</code>
                <span className="min-w-0">{scope.reason}</span>
              </li>
            ))}
          </ul>
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
