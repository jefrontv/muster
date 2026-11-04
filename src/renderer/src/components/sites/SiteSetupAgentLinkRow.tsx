// On an agent's setup review: where the server login comes from. Clicking the site's muster://
// link (or using it from the clipboard) turns this setup into the link's, which carries host,
// login and password; the password never reaches the window or the agent.

import { KeyRound } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import type { SiteSetupClipboardLink } from '../../../../shared/site-setup-approval-types'
import { SiteSetupRow } from './SiteSetupRow'

export function SiteSetupAgentLinkRow(): React.JSX.Element {
  const [link, setLink] = useState<SiteSetupClipboardLink | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const check = (): void => {
      void window.api.siteSetupAgent
        .clipboardLink()
        .then((found) => {
          if (live) {
            setLink(found)
          }
        })
        .catch(() => undefined)
    }
    check()
    // The link is usually copied in another app while this review waits.
    window.addEventListener('focus', check)
    return () => {
      live = false
      window.removeEventListener('focus', check)
    }
  }, [])

  const useLink = (): void => {
    setError('')
    void window.api.siteSetupAgent
      .useClipboardLink()
      .then((result) => {
        if (!result.ok) {
          setError(result.error)
        }
      })
      .catch(() =>
        setError(
          translate(
            'auto.components.sites.SiteSetupAgentLinkRow.failed',
            'Muster could not read that link.'
          )
        )
      )
  }

  const login = link ? [link.username, link.hostname].filter(Boolean).join('@') : ''
  return (
    <SiteSetupRow
      icon={<KeyRound className="size-4" />}
      title={translate('auto.components.sites.SiteSetupAgentLinkRow.title', 'Server login')}
      summary={
        error ||
        (link
          ? translate(
              'auto.components.sites.SiteSetupAgentLinkRow.found',
              'Link on your clipboard: {{value0}}',
              { value0: login }
            )
          : translate(
              'auto.components.sites.SiteSetupAgentLinkRow.prompt',
              "Click the site's muster:// link to add its server login, or add it later."
            ))
      }
      control={
        link ? (
          <Button size="sm" variant="secondary" onClick={useLink}>
            {translate('auto.components.sites.SiteSetupAgentLinkRow.use', 'Use link')}
          </Button>
        ) : undefined
      }
    />
  )
}
