// One toast per agent setup job (a clone, a local stack setup), updated in place as it runs.

import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { SiteSetupJobUpdate } from '../../../../shared/site-setup-approval-types'

function describe(update: SiteSetupJobUpdate): string {
  if (!update.phase) {
    return translate('auto.components.sites.setupJob.working', 'Working…')
  }
  return update.percent === null ? update.phase : `${update.phase} · ${update.percent}%`
}

export function useSiteSetupJobToasts(): void {
  useEffect(
    () =>
      window.api.siteSetupApproval.onJobUpdate((update) => {
        const id = `site-setup-job-${update.id}`
        if (update.state === 'running') {
          toast.loading(update.label, { id, description: describe(update) })
        } else if (update.state === 'succeeded') {
          toast.success(update.label, {
            id,
            description: translate('auto.components.sites.setupJob.done', 'Done')
          })
        } else {
          toast.error(update.label, { id, description: update.error })
        }
      }),
    []
  )
}
