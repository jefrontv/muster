// The HTTPS page of the guided setup: one question, "is this domain's certificate trusted yet".
//
// Split out of SiteSetupContinuation when the stages became pages. The probe stays with the parent
// because the certificate only exists after the stack has served the domain once, so its answer
// changes during the dialog's life and the stack page is what changes it.

import { Check, ShieldCheck } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import { getSiteSetupStrings } from './site-setup-strings'

export function SiteSetupHttpsStage({
  cert,
  trusting,
  onTrust
}: {
  /** Null while the domain is still unknown — the stack page has not registered one yet. */
  cert: LocalWpCertStatus | null
  trusting: boolean
  onTrust: () => void
}): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const trusted = cert?.supported === true && cert.trusted
  const missing = cert?.supported === true && !cert.exists
  const actionable = cert?.supported === true && !cert.trusted
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
      <ShieldCheck
        className={`mt-0.5 size-4 shrink-0 text-muted-foreground ${actionable ? '' : 'opacity-60'}`}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{strings.certHeading}</p>
        <p className="text-xs text-muted-foreground">
          {trusted ? strings.certTrusted : (cert?.reason ?? strings.certPending)}
        </p>
      </div>
      {actionable ? (
        <Button size="sm" variant="outline" disabled={trusting} onClick={onTrust}>
          {trusting ? strings.certTrusting : missing ? strings.certSetup : strings.certAction}
        </Button>
      ) : null}
      {trusted ? <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> : null}
    </div>
  )
}

export default SiteSetupHttpsStage
