import { useId, useLayoutEffect, useState } from 'react'
import { CircleCheck, LoaderCircle, Lock } from 'lucide-react'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { hasRemoteProviderRuntime } from '@/lib/provider-runtime-context'
import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabConnection } from '../../../shared/activecollab-types'

type ActiveCollabConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
  overlayClassName?: string
  contentClassName?: string
}

type ConnectState = 'idle' | 'connecting' | 'error' | 'connected'

/**
 * Client-side gate before the credential exchange. A bare host or a non-web scheme comes back from
 * ActiveCollab as the same opaque failure a wrong password produces, so it must be caught here or
 * the user is told to re-check a password that was fine. Returns the URL without a trailing slash,
 * or null when it is unusable.
 */
export function parseActiveCollabInstanceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    return null
  }
  return trimmed.replace(/\/+$/, '')
}

// Why: ActiveCollab trades email + password for a long-lived token exactly once. Unlike Jira there
// is no site picker (one token, one instance) and no token to paste, so the password lives in state
// only until submit hands it to the exchange — it is wiped on both the success and failure paths.
export function ActiveCollabConnectDialog({
  open,
  onOpenChange,
  onConnected,
  overlayClassName,
  contentClassName
}: ActiveCollabConnectDialogProps): React.JSX.Element {
  const connectActiveCollab = useAppStore((s) => s.connectActiveCollab)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const instanceUrlId = useId()
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [instanceUrl, setInstanceUrl] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ActiveCollabConnection | null>(null)

  // Start every open with a clean slate, before paint, so a password typed into a previous attempt
  // can never render for a frame.
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    setInstanceUrl('')
    setEmail('')
    setPassword('')
    setConnectState('idle')
    setConnectError(null)
    setConnection(null)
  }, [open])

  const busy = connectState === 'connecting'
  const canSubmit = Boolean(instanceUrl.trim() && email.trim() && password.trim()) && !busy
  const exchangeCopy = hasRemoteProviderRuntime(settings)
    ? translate(
        'auto.components.activecollab.connect.dialog.exchange_remote',
        'The password is used once to obtain the token and is never stored. Only the token reaches the selected remote runtime, kept there with runtime-supported encryption.'
      )
    : translate(
        'auto.components.activecollab.connect.dialog.exchange_local',
        'The password is used once to obtain the token and is never stored. Only the token is kept locally, encrypted when local runtime storage supports it.'
      )

  const clearErrorOnEdit = (): void => {
    if (connectState === 'error') {
      setConnectState('idle')
      setConnectError(null)
    }
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!busy) {
      onOpenChange(nextOpen)
    }
  }

  const handleConnect = async (): Promise<void> => {
    const parsedUrl = parseActiveCollabInstanceUrl(instanceUrl)
    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    if (busy || !trimmedEmail || !trimmedPassword) {
      return
    }
    if (!parsedUrl) {
      setConnectState('error')
      setConnectError(
        translate(
          'auto.components.activecollab.connect.dialog.error_instance_url',
          'Enter the full ActiveCollab URL, starting with http:// or https://.'
        )
      )
      return
    }
    setConnectState('connecting')
    setConnectError(null)
    // Drop the secret the moment it is handed off; a retry retypes it rather than reusing state.
    setPassword('')
    const result = await connectActiveCollab({
      instanceUrl: parsedUrl,
      email: trimmedEmail,
      password: trimmedPassword
    })
    if (!mountedRef.current) {
      return
    }
    if (result.ok) {
      setConnection(result.value)
      setConnectState('connected')
      onConnected?.()
      return
    }
    setConnectState('error')
    setConnectError(describeActiveCollabFailure(result))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName={overlayClassName}
        className={cn('sm:max-w-md', contentClassName)}
      >
        <DialogHeader className="gap-3">
          <DialogTitle className="leading-tight">
            {translate('auto.components.activecollab.connect.dialog.title', 'Connect ActiveCollab')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.activecollab.connect.dialog.description',
              'Muster exchanges your email and password for a long-lived ActiveCollab token once. The password itself is never stored.'
            )}
          </DialogDescription>
        </DialogHeader>
        {connectState === 'connected' && connection ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-status-success-border bg-status-success-background p-3">
              <CircleCheck className="mt-px size-4 shrink-0 text-status-success" />
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {connection.userName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{connection.userEmail}</p>
                <p className="truncate text-xs text-muted-foreground">{connection.instanceUrl}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {translate('auto.components.activecollab.connect.dialog.done', 'Done')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void handleConnect()
            }}
          >
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <Label htmlFor={instanceUrlId} className="text-xs">
                  {translate(
                    'auto.components.activecollab.connect.dialog.instance_url_label',
                    'ActiveCollab URL'
                  )}
                </Label>
                <Input
                  id={instanceUrlId}
                  autoFocus
                  placeholder={translate(
                    'auto.components.activecollab.connect.dialog.instance_url_placeholder',
                    'https://projects.example.com'
                  )}
                  value={instanceUrl}
                  onChange={(event) => {
                    setInstanceUrl(event.target.value)
                    clearErrorOnEdit()
                  }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={emailId} className="text-xs">
                  {translate('auto.components.activecollab.connect.dialog.email_label', 'Email')}
                </Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  placeholder={translate(
                    'auto.components.activecollab.connect.dialog.email_placeholder',
                    'you@example.com'
                  )}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    clearErrorOnEdit()
                  }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={passwordId} className="text-xs">
                  {translate(
                    'auto.components.activecollab.connect.dialog.password_label',
                    'Password'
                  )}
                </Label>
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    clearErrorOnEdit()
                  }}
                  disabled={busy}
                  aria-invalid={connectState === 'error'}
                  aria-describedby={connectState === 'error' ? errorId : undefined}
                />
              </div>
              {connectState === 'error' && connectError ? (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                  {connectError}
                </p>
              ) : null}
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70">
                <Lock className="mt-px size-3 shrink-0" />
                {exchangeCopy}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {translate('auto.components.activecollab.connect.dialog.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    {translate(
                      'auto.components.activecollab.connect.dialog.exchanging',
                      'Exchanging…'
                    )}
                  </>
                ) : (
                  translate('auto.components.activecollab.connect.dialog.connect', 'Connect')
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
