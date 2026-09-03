// Hosts every way into site setup at the App root, not inside the Sites page: the New site button,
// an incoming `muster://` link, and Finish setup on an existing site.
//
// Why here: minimising exists so the user can go and do something else while a clone runs, and the
// first thing they do is leave the Sites page. Mounted there, the dialog - and every piece of run
// state it holds - was destroyed on the way out. At the root it simply hides.
//
// Each request gets its own dialog instance keyed by identity, so a link arriving while a new site
// is being set up does not replace it; both park in the status bar.

import type React from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { SiteSetupDialog } from './SiteSetupDialog'
import { siteBindApi, usePendingSiteBind } from './use-pending-site-bind'

export function SiteSetupHost(): React.JSX.Element | null {
  const newSiteOpen = useAppStore((s) => s.newSiteDialogOpen)
  const setNewSiteOpen = useAppStore((s) => s.setNewSiteDialogOpen)
  const finishRequest = useAppStore((s) => s.finishSiteSetupRequest)
  const setFinishRequest = useAppStore((s) => s.setFinishSiteSetupRequest)
  const fetchSites = useAppStore((s) => s.fetchSites)
  const selectSite = useAppStore((s) => s.selectSite)
  const { pending, dismiss, clear } = usePendingSiteBind()

  // A refused link used to activate the app with nothing on screen. The reason names a key at most,
  // never a value, so it is safe to show.
  useEffect(() => {
    return siteBindApi()?.onRejected((reason) => {
      toast.error(
        translate('auto.components.sites.SiteSetupHost.linkRejected', 'Link not accepted'),
        { description: reason }
      )
    })
  }, [])

  const onSiteReady = (siteId: string): void => {
    void fetchSites()
    selectSite(siteId)
  }

  return (
    <>
      {newSiteOpen ? (
        <SiteSetupDialog
          request={{ kind: 'repo' }}
          onClose={() => setNewSiteOpen(false)}
          onSiteReady={onSiteReady}
        />
      ) : null}
      {pending ? (
        <SiteSetupDialog
          key={pending.requestId}
          request={{ kind: 'link', pending }}
          onClose={(reason) => (reason === 'dismissed' ? dismiss() : clear())}
          onSiteReady={onSiteReady}
        />
      ) : null}
      {finishRequest ? (
        <SiteSetupDialog
          key={finishRequest.siteId}
          request={{ kind: 'site', siteId: finishRequest.siteId, label: finishRequest.label }}
          onClose={() => setFinishRequest(null)}
          onSiteReady={onSiteReady}
        />
      ) : null}
    </>
  )
}

export default SiteSetupHost
