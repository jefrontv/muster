// The approval card for an agent asking to create a project or write site config, or asking the
// user to type a password. App-wide so it shows over any view, Bots included.

import { useEffect, useState } from 'react'
import { Bot, KeyRound } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { SiteSetupApprovalRequest } from '../../../../shared/site-setup-approval-types'
import { isAlwaysAllowableSetupAction } from '../../../../shared/site-setup-always-allow'
import { siteSetupActionLabel } from './site-setup-action-labels'
import { SiteSetupClipboardLinkOffer } from './SiteSetupClipboardLinkOffer'
import { useSiteSetupJobToasts } from './use-site-setup-job-toasts'

type Decision = 'approved' | 'approved-site' | 'denied'

export function SiteSetupApprovalDialog(): React.JSX.Element | null {
  const [queue, setQueue] = useState<SiteSetupApprovalRequest[]>([])
  useSiteSetupJobToasts()

  useEffect(() => {
    const add = (request: SiteSetupApprovalRequest): void =>
      setQueue((pending) =>
        pending.some((item) => item.requestId === request.requestId)
          ? pending
          : [...pending, request]
      )
    const offRequest = window.api.siteSetupApproval.onRequest(add)
    const offResolved = window.api.siteSetupApproval.onResolved((requestId) =>
      setQueue((pending) => pending.filter((item) => item.requestId !== requestId))
    )
    // A request queued before this window mounted would otherwise wait out its expiry unseen.
    void window.api.siteSetupApproval
      .listPending()
      .then((pending) => pending.forEach(add))
      .catch(() => undefined)
    return () => {
      offRequest()
      offResolved()
    }
  }, [])

  const current = queue[0] ?? null
  if (!current) {
    return null
  }
  // Keyed so a password typed for one prompt never carries into the next card.
  return (
    <ApprovalCard
      key={current.requestId}
      request={current}
      waiting={queue.length - 1}
      onDone={() => setQueue((pending) => pending.filter((item) => item !== current))}
    />
  )
}

export function ApprovalCard({
  request,
  waiting,
  onDone
}: {
  request: SiteSetupApprovalRequest
  waiting: number
  onDone: () => void
}): React.JSX.Element {
  const [secretValue, setSecretValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const secret = request.secret ?? null
  // A password or a removal always asks, so the box never shows on those cards.
  const grantable = !secret && isAlwaysAllowableSetupAction(request.action) ? request.action : null

  const respond = async (decision: Decision, useClipboardLink = false): Promise<void> => {
    try {
      await window.api.siteSetupApproval.respond({
        requestId: request.requestId,
        decision,
        ...(grantable && alwaysAllow && decision !== 'denied' ? { alwaysAllow: true } : {}),
        ...(useClipboardLink
          ? { useClipboardLink: true }
          : secret && decision !== 'denied'
            ? { secretValue }
            : {})
      })
      onDone()
    } catch (failure) {
      // The card stays open so a keychain error or an empty password can be fixed and retried.
      setError(extractIpcErrorMessage(failure, 'Muster could not save this.'))
    }
  }
  const agent =
    request.agent ?? translate('auto.components.sites.setupApproval.anAgent', 'An agent')

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          void respond('denied')
        }
      }}
    >
      {/* Deny comes first in the footer, so a stray Enter declines instead of approving. */}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {secret ? (
              <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            {request.title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {secret
              ? translate(
                  'auto.components.sites.setupApproval.secretDescription',
                  '{{value0}} needs this password. It is saved to your keychain and never shown to the agent.',
                  { value0: agent }
                )
              : translate(
                  'auto.components.sites.setupApproval.description',
                  '{{value0}} is asking to make this change. Nothing is written until you approve.',
                  { value0: agent }
                )}
          </DialogDescription>
        </DialogHeader>
        <p className="text-[13px] leading-5 text-foreground">{request.summary}</p>
        {request.details.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-foreground/[0.05] px-4 py-3 text-[13px]">
            {request.details.map((detail) => (
              <div key={detail.label} className="contents">
                <dt className="text-muted-foreground">{detail.label}</dt>
                <dd className="min-w-0 break-words font-mono text-[12px] text-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {secret?.kind === 'ssh' ? (
          <SiteSetupClipboardLinkOffer
            requestId={request.requestId}
            environment={secret.environment}
            onUse={() => void respond('approved', true)}
          />
        ) : null}
        {secret ? (
          <form
            className="grid gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              void respond('approved')
            }}
          >
            <Label htmlFor="site-setup-secret">
              {translate('auto.components.sites.setupApproval.password', 'Password')}
            </Label>
            <Input
              id="site-setup-secret"
              type="password"
              autoComplete="off"
              autoFocus
              value={secretValue}
              onChange={(event) => setSecretValue(event.target.value)}
            />
          </form>
        ) : null}
        {grantable ? (
          <label
            htmlFor="site-setup-always-allow"
            className="flex cursor-pointer items-start gap-3"
          >
            <Checkbox
              id="site-setup-always-allow"
              className="mt-0.5"
              checked={alwaysAllow}
              onCheckedChange={(value) => setAlwaysAllow(value === true)}
            />
            <span className="space-y-0.5">
              <span className="block text-[13px] font-medium">
                {translate(
                  'auto.components.sites.setupApproval.alwaysAllow',
                  'Always allow without asking'
                )}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {translate(
                  'auto.components.sites.setupApproval.alwaysAllowHint',
                  '{{value0}}, by any agent, on any site. Remove it in Settings → Agent Capabilities.',
                  { value0: siteSetupActionLabel(grantable) }
                )}
              </span>
            </span>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        {waiting > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {translate(
              'auto.components.sites.setupApproval.queued',
              '{{value0}} more waiting after this one.',
              { value0: waiting }
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void respond('denied')}>
            {secret
              ? translate('auto.components.sites.setupApproval.skip', 'Skip')
              : translate('auto.components.sites.setupApproval.deny', 'Deny')}
          </Button>
          {/* A standing grant already covers every site, so the per-site button would mislead. */}
          {request.siteId && !secret && !alwaysAllow ? (
            <Button type="button" variant="secondary" onClick={() => void respond('approved-site')}>
              {translate(
                'auto.components.sites.setupApproval.approveSite',
                'Approve for {{value0}}',
                { value0: request.siteName ?? request.siteId }
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={secret !== null && secretValue.length === 0}
            onClick={() => void respond('approved')}
          >
            {secret
              ? translate('auto.components.sites.setupApproval.savePassword', 'Save password')
              : translate('auto.components.sites.setupApproval.approve', 'Approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
