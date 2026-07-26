// Stages 3 and 4 of the guided setup, shown after a `muster://` link has been confirmed.
//
// Why this is a separate component rather than more steps inside SiteBindDialog: the bind dialog is
// a consent gate — its whole contract is that nothing is written until you press Confirm. These
// stages run *after* that write, are individually optional, and each one can be unavailable for a
// reason the user has to read. Keeping them apart means the consent gate stays small and honest.
//
// Neither stage renders progress. LocalWP migration is a single awaited call, and the import hands
// off to the run console on the site page, which already streams logs and supports cancel — a
// second log viewer here would be a worse copy of it.

import { Check, Database, HardDrive, Loader2, ShieldCheck } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { SiteSetupPlan, SiteSetupStage } from '../../../../shared/site-setup-flow-types'
import { findSetupStage } from '../../../../shared/site-setup-flow-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import { getSiteSetupStrings } from './site-setup-strings'

type StageOutcome = 'idle' | 'busy' | 'done' | 'skipped'

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
  const [domain, setDomain] = useState('')
  const [stack, setStack] = useState<StageOutcome>('idle')
  const [importState, setImportState] = useState<StageOutcome>('idle')
  const [error, setError] = useState('')
  const [cert, setCert] = useState<LocalWpCertStatus | null>(null)
  const [trusting, setTrusting] = useState(false)

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
      setDomain(result.value.stack.suggestedDomain)
      // Already-LocalWP sites have a domain from the start, so the certificate stage is
      // answerable before the user touches anything.
      const domainNow = result.value.stack.suggestedDomain.trim()
      if (domainNow.length > 0) {
        const status = await window.api.localwpCert?.status({ domain: domainNow })
        if (!cancelled && status?.ok) {
          setCert(status.value)
        }
      }
    })()
    return () => {
      cancelled = true
    }
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
  const refreshCert = async (forDomain: string): Promise<void> => {
    if (forDomain.trim().length === 0) {
      return
    }
    const result = await window.api.localwpCert?.status({ domain: forDomain.trim() })
    if (result?.ok) {
      setCert(result.value)
    }
  }

  const runTrustCert = async (): Promise<void> => {
    setTrusting(true)
    setError('')
    try {
      const result = await window.api.localwpCert.trust({ domain: domain.trim() })
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
  const runStack = async (): Promise<void> => {
    setStack('busy')
    setError('')
    try {
      // Preview first even though we do not render the plan: it is the call that reports a
      // conflicting site or an unusable domain, so it turns a mid-migration failure into a message.
      const preview = await window.api.siteStacks.previewMigration({ siteId, domain })
      if (!preview.ok) {
        setError(preview.error)
        setStack('idle')
        return
      }
      const migrated = await window.api.siteStacks.runMigration({ siteId, domain })
      if (!migrated.ok) {
        setError(migrated.error)
        setStack('idle')
        return
      }
      setStack('done')
      // The migration is what gives the site its local domain, so the certificate question only
      // becomes answerable now.
      void refreshCert(domain)
    } catch (migrationError) {
      setError(migrationError instanceof Error ? migrationError.message : String(migrationError))
      setStack('idle')
    }
  }

  const runImport = async (): Promise<void> => {
    setImportState('busy')
    setError('')
    const result = await window.api.siteRuns.start({
      siteId,
      group: 'import',
      ...(plan.import.environment ? { environment: plan.import.environment } : {})
    })
    if (!result.ok) {
      setError(result.error)
      setImportState('idle')
      return
    }
    setImportState('done')
  }

  return (
    <div className="space-y-3">
      {isActionable(stackStage) ? (
        <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <HardDrive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">{strings.stackHeading}</p>
              <p className="text-xs text-muted-foreground">{strings.stackBody}</p>
            </div>
            {stack === 'done' ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3.5" />
                {strings.stackDone}
              </span>
            ) : null}
          </div>
          {stack === 'idle' || stack === 'busy' ? (
            <div className="flex items-center gap-2 pl-6.5">
              <label className="sr-only" htmlFor="setup-local-domain">
                {strings.stackDomainLabel}
              </label>
              <Input
                id="setup-local-domain"
                className="h-8 font-mono text-xs"
                value={domain}
                disabled={stack === 'busy'}
                onChange={(event) => setDomain(event.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={stack === 'busy' || domain.trim().length === 0}
                onClick={() => void runStack()}
              >
                {stack === 'busy' ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {strings.stackRunning}
                  </>
                ) : (
                  strings.stackAction
                )}
              </Button>
            </div>
          ) : null}
        </div>
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

      {plan.import.ready || plan.import.confirmable ? (
        <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">{strings.importHeading}</p>
              <p className="text-xs text-muted-foreground">
                {importState === 'done' ? strings.importStarted : strings.importBody}
              </p>
              {/* The count is the honest signal that the link configured anything worth running. */}
              {importState !== 'done' && plan.import.enabledStepCount > 0 ? (
                <p className="text-[11px] text-muted-foreground/70">
                  {strings.importSteps.replace('{{count}}', String(plan.import.enabledStepCount))}
                </p>
              ) : null}
              {/* Blocked-but-confirmable is a branch/environment mismatch: allowed, with the reason visible. */}
              {!plan.import.ready && importState !== 'done' ? (
                <p className="text-[11px] text-muted-foreground/70">{importStage?.reason ?? ''}</p>
              ) : null}
            </div>
            {importState === 'done' ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={importState === 'busy' || plan.import.enabledStepCount === 0}
                onClick={() => void runImport()}
              >
                {importState === 'busy'
                  ? strings.importStarting
                  : plan.import.ready
                    ? strings.importAction
                    : strings.overrideAction}
              </Button>
            )}
          </div>
        </div>
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
