// Hosts the New Site flow at the App root, not inside the Sites page.
//
// Why it moved: minimizing exists so the user can go and do something else while a clone runs, and
// the first thing they do is leave the Sites page. Mounted there, the dialog — and every piece of
// clone state, progress subscription and timer it holds — was destroyed on the way out. At the
// root it simply hides.
//
// It fetches its own destination root rather than taking it as a prop, because there is no longer
// a parent screen guaranteed to be mounted when the flow opens.

import type React from 'react'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { AddSiteFromGitDialog } from './AddSiteFromGitDialog'

export function SiteSetupHost(): React.JSX.Element | null {
  const open = useAppStore((s) => s.newSiteDialogOpen)
  const setOpen = useAppStore((s) => s.setNewSiteDialogOpen)
  const fetchSites = useAppStore((s) => s.fetchSites)
  const selectSite = useAppStore((s) => s.selectSite)
  const [primaryRoot, setPrimaryRoot] = useState('')

  // Why still subscribed while closed: the root can change from Settings, and the dialog must not
  // open onto a stale destination the user already moved.
  useEffect(() => {
    let disposed = false
    const load = async (): Promise<void> => {
      const result = await window.api.siteRoots?.discover()
      if (!disposed && result?.ok) {
        setPrimaryRoot(result.value.primaryRoot)
      }
    }
    void load()
    const unsubscribe = window.api.siteRoots?.onChanged(() => void load())
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  // Why not mount until asked: the dialog runs repo listing effects on mount, and paying for those
  // on every launch to host a flow nobody started would be a waste. Once open it stays mounted for
  // the life of the flow, including while minimized.
  if (!open) {
    return null
  }

  return (
    <AddSiteFromGitDialog
      open
      destinationRoot={primaryRoot}
      onOpenChange={setOpen}
      onAdded={(siteId) => {
        void fetchSites()
        selectSite(siteId)
      }}
    />
  )
}
