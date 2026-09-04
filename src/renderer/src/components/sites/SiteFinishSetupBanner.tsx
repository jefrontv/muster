// "Setup isn't finished" on a site page. The old setup stepper existed only inside the two entry
// dialogs, so a site left mid-setup (cloned, nothing serving it) had no way back in. This asks the
// planner once per selected site and offers the same review the dialogs use.

import { AlertTriangle } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'

type Reason = 'no-stack' | 'no-cert'

export function SiteFinishSetupBanner({
  summary
}: {
  summary: SiteSummary
}): React.JSX.Element | null {
  const { site } = summary
  const openFinish = useAppStore((s) => s.setFinishSiteSetupRequest)
  const [reason, setReason] = useState<Reason | null>(null)

  useEffect(() => {
    let cancelled = false
    setReason(null)
    if (!summary.pathExists) {
      return
    }
    void (async () => {
      const plan = await window.api.siteSetup?.plan({ siteId: site.id, reponame: '', branch: null })
      if (cancelled || !plan?.ok) {
        return
      }
      // Readiness, not the stage word: the planner reports 'pending' for a folder nothing serves.
      const { stack } = plan.value
      if (stack.supported && stack.stack === 'plain' && stack.alternatives.length > 0) {
        setReason('no-stack')
        return
      }
      const domain = site.localDomain.trim()
      if (domain.length === 0 || site.localStack === 'plain') {
        return
      }
      const cert = await window.api.localwpCert?.status({ domain, stack: site.localStack })
      if (!cancelled && cert?.ok && cert.value.supported && !cert.value.trusted) {
        setReason('no-cert')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [site.id, site.localDomain, site.localStack, summary.pathExists])

  if (!reason) {
    return null
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <AlertTriangle className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          {translate('auto.components.sites.SiteFinishSetupBanner.title', "Setup isn't finished")}
        </p>
        <p className="text-xs text-muted-foreground">
          {reason === 'no-stack'
            ? translate(
                'auto.components.sites.SiteFinishSetupBanner.noStack',
                'Nothing is serving this folder locally.'
              )
            : translate(
                'auto.components.sites.SiteFinishSetupBanner.noCert',
                'The HTTPS certificate for {{domain}} is not trusted yet.'
              ).replace('{{domain}}', site.localDomain)}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => openFinish({ siteId: site.id, label: site.displayName })}
      >
        {translate('auto.components.sites.SiteFinishSetupBanner.action', 'Finish setup')}
      </Button>
    </div>
  )
}
