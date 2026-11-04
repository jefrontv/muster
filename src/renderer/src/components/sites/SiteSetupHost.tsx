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
import { useEffect, useRef, useState } from 'react'
import type { SiteSetupAgentRequest } from '../../../../shared/site-setup-agent-types'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { SiteSetupDialog, type SiteSetupAgentContext } from './SiteSetupDialog'
import { siteBindApi, usePendingSiteBind } from './use-pending-site-bind'

export function SiteSetupHost({
  holdLinks = false
}: {
  /** True while onboarding covers the app: a link's dialog would open behind it, so it waits. */
  holdLinks?: boolean
} = {}): React.JSX.Element | null {
  const newSiteOpen = useAppStore((s) => s.newSiteDialogOpen)
  const setNewSiteOpen = useAppStore((s) => s.setNewSiteDialogOpen)
  const finishRequest = useAppStore((s) => s.finishSiteSetupRequest)
  const setFinishRequest = useAppStore((s) => s.setFinishSiteSetupRequest)
  const fetchSites = useAppStore((s) => s.fetchSites)
  const selectSite = useAppStore((s) => s.selectSite)
  const { pending, dismiss, clear } = usePendingSiteBind()
  const [agentRequest, setAgentRequest] = useState<SiteSetupAgentRequest | null>(null)
  const [agentStarted, setAgentStarted] = useState(false)

  useEffect(() => {
    // Absent in the web client, which has no agent setups to show.
    const api = window.api?.siteSetupAgent
    if (!api) {
      return
    }
    const open = (request: SiteSetupAgentRequest): void => {
      setAgentStarted(false)
      setAgentRequest(request)
    }
    const off = api.onOpen(open)
    // A setup opened before this window mounted would otherwise never show.
    void api
      .listOpen()
      .then((open_) => (open_[0] ? open(open_[0]) : undefined))
      .catch(() => undefined)
    return off
  }, [])

  const agent: SiteSetupAgentContext | null = agentRequest
    ? { setupId: agentRequest.setupId, name: agentRequest.agent, hints: agentRequest.hints }
    : null
  // A link opened during an agent's review carries the server login, so it takes the setup over.
  // Sticky per link: once that link's run starts, the agent's own dialog must not come back.
  const [takenByLinkId, setTakenByLinkId] = useState('')
  useEffect(() => {
    if (agentRequest && pending && !agentStarted && !holdLinks && takenByLinkId === '') {
      setTakenByLinkId(pending.requestId)
    }
  }, [agentRequest, pending, agentStarted, holdLinks, takenByLinkId])
  const linkTakesAgent = agent !== null && pending !== null && pending.requestId === takenByLinkId

  // Ignored by main once the dialog has reported `done`, so closing a finished setup costs nothing.
  const finishAgent = (started: boolean): void => {
    if (!agentRequest) {
      return
    }
    void window.api.siteSetupAgent
      .report(agentRequest.setupId, {
        state: started ? 'failed' : 'cancelled',
        step: '',
        percent: null,
        detail: started ? 'The user closed setup before it finished.' : 'The user closed setup.',
        result: null
      })
      .catch(() => undefined)
    setAgentRequest(null)
    setTakenByLinkId('')
  }

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

  // Once per link: the toast is the only sign it arrived until onboarding closes.
  const announcedRef = useRef('')
  useEffect(() => {
    if (!holdLinks || !pending || announcedRef.current === pending.requestId) {
      return
    }
    announcedRef.current = pending.requestId
    toast.info(
      translate(
        'auto.components.sites.SiteSetupHost.linkHeld',
        'Site link received. It opens when you finish setup.'
      )
    )
  }, [holdLinks, pending])

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
      {agentRequest && agent && takenByLinkId === '' ? (
        <SiteSetupDialog
          key={agentRequest.setupId}
          request={
            agentRequest.source.kind === 'repo'
              ? { kind: 'repo', repo: agentRequest.source.repo, agent }
              : {
                  kind: 'site',
                  siteId: agentRequest.source.siteId,
                  label: agentRequest.label,
                  agent
                }
          }
          onStarted={() => setAgentStarted(true)}
          onClose={(reason) => finishAgent(reason === 'finished')}
          onSiteReady={onSiteReady}
        />
      ) : null}
      {pending && !holdLinks ? (
        <SiteSetupDialog
          key={pending.requestId}
          request={{ kind: 'link', pending, ...(linkTakesAgent && agent ? { agent } : {}) }}
          onStarted={linkTakesAgent ? () => setAgentStarted(true) : undefined}
          onClose={(reason) => {
            if (linkTakesAgent) {
              finishAgent(reason === 'finished')
            }
            return reason === 'dismissed' ? dismiss() : clear()
          }}
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
