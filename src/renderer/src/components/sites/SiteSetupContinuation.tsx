// Stages 3 and 4 of the guided setup, shown after a `muster://` link has been confirmed.
//
// Why this is a separate component rather than more steps inside SiteBindDialog: the bind dialog is
// a consent gate — its whole contract is that nothing is written until you press Confirm. These
// stages run *after* that write, are individually optional, and each one can be unavailable for a
// reason the user has to read. Keeping them apart means the consent gate stays small and honest.
//
// The LocalWP stage streams its progress (see SiteSetupStackStage). The import stage (see
// SiteSetupImportStage) does not: it hands off to the run console on the site page, which already
// streams logs and supports cancel — a second log viewer here would be a worse copy of it.

import { Check, Database, HardDrive, Loader2, ShieldCheck } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { SiteSetupPlan, SiteSetupStage } from '../../../../shared/site-setup-flow-types'
import { findSetupStage } from '../../../../shared/site-setup-flow-types'
import { Button } from '@/components/ui/button'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { getSiteSetupStrings } from './site-setup-strings'
import { SiteSetupImportStage } from './SiteSetupImportStage'
import { SiteSetupStackStage } from './SiteSetupStackStage'

/** A stage the machine or the configuration rules out entirely — shown, but never actionable. */
function UnavailableRow({
  icon,
  heading,
  reason
}: {
  icon: React.JSX.Element
  heading: string
  reason: string
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5 opacity-60">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{heading}</p>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </div>
    </div>
  )
}

function isActionable(stage: SiteSetupStage | null): boolean {
  return stage !== null && stage.state !== 'unavailable'
}

export function SiteSetupContinuation({
  siteId,
  reponame,
  branch,
  onDone
}: {
  siteId: string
  reponame: string
  branch: string | null
  onDone: () => void
}): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const [plan, setPlan] = useState<SiteSetupPlan | null>(null)
  // Owned here, not by the stack stage: the certificate stage needs it even for a site that was
  // already LocalWP and never runs a migration.
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const [cert, setCert] = useState<LocalWpCertStatus | null>(null)
  const [trusting, setTrusting] = useState(false)
  // Which stack owns the certificate. Seeded from detection, then replaced by whatever the stack
  // stage actually migrated onto — the two differ for exactly one dialog: a plain site being set up.
  const [certStack, setCertStack] = useState<SiteLocalStack>('localwp')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await window.api.siteSetup.plan({ siteId, reponame, branch })
      if (cancelled) {
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPlan(result.value)
      // The certificate stage keys off the domain the stack stage will register.
      setDomain(result.value.stack.suggestedDomain)
      // Already-LocalWP sites have a domain from the start, so the certificate stage is
      // answerable before the user touches anything.
      const detectedStack =
        result.value.stack.stack === 'agent-local' ? 'agent-local' : ('localwp' as const)
      setCertStack(detectedStack)
      const domainNow = result.value.stack.suggestedDomain.trim()
      if (domainNow.length > 0) {
        const status = await window.api.localwpCert?.status({
          domain: domainNow,
          stack: detectedStack
        })
        if (!cancelled && status?.ok) {
          setCert(status.value)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId, reponame, branch])

  // Enabling an import step changes what the run planner allows, so the plan is re-read rather
  // than patched locally: the planner is the only thing that decides whether a run may start.
  const replan = useCallback((): void => {
    void (async () => {
      const result = await window.api.siteSetup.plan({ siteId, reponame, branch })
      if (result.ok) {
        setPlan(result.value)
      }
    })()
  }, [siteId, reponame, branch])

  if (error.length > 0 && !plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button onClick={onDone}>{strings.done}</Button>
      </div>
    )
  }

  if (!plan) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {strings.loading}
      </p>
    )
  }

  const stackStage = findSetupStage(plan, 'stack')
  const importStage = findSetupStage(plan, 'import')

  // Why a separate probe rather than a field on the plan: the certificate only exists after
  // LocalWP has served the site over https once, so this answer changes during the dialog's
  // lifetime while the rest of the plan does not.
  const refreshCert = async (forDomain: string, stack = certStack): Promise<void> => {
    if (forDomain.trim().length === 0) {
      return
    }
    const result = await window.api.localwpCert?.status({ domain: forDomain.trim(), stack })
    if (result?.ok) {
      setCert(result.value)
    }
  }

  const runTrustCert = async (): Promise<void> => {
    setTrusting(true)
    setError('')
    try {
      const result = await window.api.localwpCert.trust({ domain: domain.trim(), stack: certStack })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!result.value.ok) {
        setError(result.value.message)
      }
      await refreshCert(domain)
    } finally {
      setTrusting(false)
    }
  }

  return (
    <div className="space-y-3">
      {isActionable(stackStage) ? (
        <SiteSetupStackStage
          siteId={siteId}
          suggestedDomain={plan.stack.suggestedDomain}
          // What the planner found on disk, so a folder agent-local already serves does not open
          // on a proposal to set it up with LocalWP.
          detectedStack={plan.stack.stack === 'agent-local' ? 'agent-local' : null}
          onMigrated={(migratedDomain, migratedStack) => {
            // The migration is what gives the site its local domain, so the certificate question
            // only becomes answerable now — and it must be asked of the stack just migrated onto,
            // not the one detection saw before the migration ran.
            setDomain(migratedDomain)
            setCertStack(migratedStack)
            void refreshCert(migratedDomain, migratedStack)
          }}
        />
      ) : (
        <UnavailableRow
          icon={<HardDrive className="size-4" />}
          heading={strings.stackHeading}
          reason={stackStage?.reason ?? strings.unavailable}
        />
      )}

      {/* HTTPS sits between the stack and the import: it only means anything once LocalWP owns the
          site, and an untrusted certificate is what makes the local URL warn in the browser. */}
      {cert && cert.supported && cert.exists && !cert.trusted ? (
        <div className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium">{strings.certHeading}</p>
            <p className="text-xs text-muted-foreground">{cert.reason}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={trusting}
            onClick={() => void runTrustCert()}
          >
            {trusting ? strings.certTrusting : strings.certAction}
          </Button>
        </div>
      ) : null}
      {cert && cert.supported && cert.trusted ? (
        <div className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium">{strings.certHeading}</p>
            <p className="text-xs text-muted-foreground">{strings.certTrusted}</p>
          </div>
          <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        </div>
      ) : null}
      {cert && cert.supported && !cert.exists ? (
        <UnavailableRow
          icon={<ShieldCheck className="size-4" />}
          heading={strings.certHeading}
          reason={cert.reason}
        />
      ) : null}

      {/* An empty step list is the one import block the user can clear from here, so it must not
          collapse into an unavailable row: the stage offers the toggles instead. Everything else
          (no environment, missing SSH password, missing checkout) is fixed elsewhere. */}
      {plan.import.ready ||
      plan.import.confirmable ||
      (plan.import.environment.length > 0 &&
        plan.import.blockedBy.includes('no-steps-selected')) ? (
        <SiteSetupImportStage siteId={siteId} readiness={plan.import} onStepsChanged={replan} />
      ) : (
        <UnavailableRow
          icon={<Database className="size-4" />}
          heading={strings.importHeading}
          reason={importStage?.reason ?? strings.unavailable}
        />
      )}

      {error.length > 0 ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export default SiteSetupContinuation
