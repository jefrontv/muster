// On an SSH password card: offers a muster:// link the user opened or copied. Main reads the clipboard and
// sends only the non-secret fields; the password goes from main to the keychain.

import { useEffect, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import type { SiteSetupClipboardLink } from '../../../../shared/site-setup-approval-types'

export function SiteSetupClipboardLinkOffer({
  requestId,
  environment,
  onUse
}: {
  requestId: string
  environment: string
  onUse: () => void
}): React.JSX.Element | null {
  const [link, setLink] = useState<SiteSetupClipboardLink | null>(null)

  useEffect(() => {
    let live = true
    const check = (): void => {
      void window.api.siteSetupApproval
        .clipboardLink(requestId)
        .then((found) => {
          if (live) {
            setLink(found)
          }
        })
        .catch(() => undefined)
    }
    check()
    // Copying or clicking the link usually happens after the card opens, in another app.
    window.addEventListener('focus', check)
    const offLink = window.api.siteSetupApproval.onLinkReceived((id) => {
      if (id === requestId) {
        check()
      }
    })
    return () => {
      live = false
      window.removeEventListener('focus', check)
      offLink()
    }
  }, [requestId])

  if (!link) {
    return null
  }
  const rows: [string, string][] = [
    [translate('auto.components.sites.setupApproval.linkRepo', 'Repo'), link.reponame],
    [translate('auto.components.sites.setupApproval.linkHost', 'Host'), link.hostname],
    [translate('auto.components.sites.setupApproval.linkUser', 'User'), link.username],
    [translate('auto.components.sites.setupApproval.linkRoot', 'Root path'), link.rootPath],
    [translate('auto.components.sites.setupApproval.linkDomain', 'Live domain'), link.liveDomain]
  ]
  const otherEnvironment = link.environment && link.environment !== environment

  return (
    <div className="grid gap-2 rounded-xl border border-border px-4 py-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {link.source === 'opened'
          ? translate('auto.components.sites.setupApproval.linkOpened', 'Link you opened')
          : translate('auto.components.sites.setupApproval.linkFound', 'Link on your clipboard')}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
        {rows
          .filter(([, value]) => value.length > 0)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words font-mono text-foreground">{value}</dd>
            </div>
          ))}
      </dl>
      <p className="text-[12px] text-muted-foreground">
        {otherEnvironment
          ? translate(
              'auto.components.sites.setupApproval.linkOtherEnvironment',
              'The link is for {{value0}}. Using it fills {{value1}} and saves its password.',
              { value0: link.environment, value1: environment }
            )
          : translate(
              'auto.components.sites.setupApproval.linkFills',
              'Using it fills {{value0}} and saves the password from the link.',
              { value0: environment }
            )}
      </p>
      <Button type="button" variant="secondary" className="justify-self-start" onClick={onUse}>
        {translate('auto.components.sites.setupApproval.useLink', 'Use this link')}
      </Button>
    </div>
  )
}
