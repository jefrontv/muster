// Stages 3 and 4 of the guided setup, shown after a `muster://` link has been confirmed.
//
// Why this is a separate component rather than more steps inside SiteBindDialog: the bind dialog is
// a consent gate — its whole contract is that nothing is written until you press Confirm. These
// stages run *after* that write, are individually optional, and each one can be unavailable for a
// reason the user has to read. Keeping them apart means the consent gate stays small and honest.
//
// One decision per page (stack → https → import), and this component owns the footer. Stacking all
// three on one scrolling surface put the host dialog's Done next to a spinner: the plan had not
// loaded, no stage had rendered, and Done was already the most obvious button on screen. Paging
// makes Done exist only on the last page, and gives "no stack picked yet" somewhere to block.
//
// The LocalWP stage streams its progress (see SiteSetupStackStage). The import stage (see
// SiteSetupImportStage) does not: it hands off to the run console on the site page, which already
// streams logs and supports cancel — a second log viewer here would be a worse copy of it.

import { Database, HardDrive, Loader2 } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SiteSetupPlan, SiteSetupStage } from '../../../../shared/site-setup-flow-types'
import { findSetupStage } from '../../../../shared/site-setup-flow-types'
import { Button } from '@/components/ui/button'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { getSiteSetupStrings } from './site-setup-strings'
import { SiteSetupHttpsStage } from './SiteSetupHttpsStage'
import { SiteSetupImportStage, type SiteSetupImportStageHandle } from './SiteSetupImportStage'
import { SiteSetupStackStage } from './SiteSetupStackStage'
import {
  SETUP_STEP_ORDER,
  SiteSetupStepNav,
  SiteSetupStepRail,
  type SetupStepId
} from './SiteSetupStepNav'

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
  onDone,
  onBusyChange
}: {
  siteId: string
  reponame: string
  branch: string | null
  onDone: () => void
  /** Lets the host dialog refuse Escape and outside-clicks while a stage is mid-run. */
  onBusyChange?: (busy: boolean) => void
}): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const [step, setStep] = useState<SetupStepId>('stack')
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
  // Mirrored out of the stack stage so this page can refuse to advance into an import with no stack
  const [choicePending, setChoicePending] = useState(false)
  // True once the local stack actually ran (or was already serving the folder) — the stack step
  // now blocks Next until this is satisfied, so a fresh clone cannot advance into an import with
  // nothing serving it locally.
  const [stackDone, setStackDone] = useState(false)
  // A stage is mid-run. Nav locks entirely while it is: both stages own work that has no way back
  // if the dialog closes under it.
  const [stageBusy, setStageBusy] = useState(false)
  // The import step's footer swaps Done for Run: these two track whether there is something to run
  // and whether it finished, so the parent can render the right primary action.
  const [importSucceeded, setImportSucceeded] = useState(false)
  const [importStartable, setImportStartable] = useState(false)
  const importStageRef = useRef<SiteSetupImportStageHandle | null>(null)
  useEffect(() => {
    onBusyChange?.(stageBusy)
  }, [stageBusy, onBusyChange])

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

  const refreshCert = useCallback(
    async (forDomain: string, stack: SiteLocalStack): Promise<void> => {
      if (forDomain.trim().length === 0) {
        return
      }
      const result = await window.api.localwpCert?.status({ domain: forDomain.trim(), stack })
      if (result?.ok) {
        setCert(result.value)
      }
    },
    []
  )

  const onMigrated = useCallback(
    (migratedDomain: string, migratedStack: SiteLocalStack): void => {
      // The migration is what gives the site its local domain, so the certificate question only
      // becomes answerable now — and it must be asked of the stack just migrated onto, not the one
      // detection saw before the migration ran.
      setStackDone(true)
      setDomain(migratedDomain)
      setCertStack(migratedStack)
      void refreshCert(migratedDomain, migratedStack)
    },
    [refreshCert]
  )

  const runTrustCert = async (): Promise<void> => {
    setTrusting(true)
    setError('')
    try {
      const result = cert?.exists
        ? await window.api.localwpCert.trust({ domain: domain.trim(), stack: certStack })
        : await window.api.localwpCert.ensure({
            domain: domain.trim(),
            siteId,
            stack: certStack
          })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!result.value.ok) {
        setError(result.value.message)
      }
      await refreshCert(domain, certStack)
    } finally {
      setTrusting(false)
    }
  }

  const goNext = (): void => {
    const next = SETUP_STEP_ORDER[SETUP_STEP_ORDER.indexOf(step) + 1]
    if (next) {
      setStep(next)
    }
  }

  const goBack = (): void => {
    const previous = SETUP_STEP_ORDER[SETUP_STEP_ORDER.indexOf(step) - 1]
    if (previous) {
      setStep(previous)
    }
  }

  // Skips the local stack (and the HTTPS step that depends on it) straight to the import, the
  // last page — the user chose to leave the site not served locally for now.
  const skipStack = (): void => {
    setStep('import')
  }

  if (error.length > 0 && !plan) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button onClick={onDone}>{strings.done}</Button>
      </div>
    )
  }

  const stackStage = plan ? findSetupStage(plan, 'stack') : null
  const importStage = plan ? findSetupStage(plan, 'import') : null
  // A stage the planner ruled out has nothing to pick, so it cannot be what holds the user up.
  const needsStackChoice = plan !== null && isActionable(stackStage) && choicePending
  // The stack step is satisfied when the migration ran, the folder was already on a managed stack,
  // or the stage is unavailable. Otherwise Next stays blocked until setup runs (or the user skips).
  const stackSatisfied =
    plan === null || !isActionable(stackStage) || stackDone || plan.stack.alreadyLocalWp
  const canAdvance = plan !== null && (step !== 'stack' || stackSatisfied)
  // Whether the import stage renders at all (rather than an unavailable row) — the same predicate
  // the render below uses.
  const importStageShown =
    plan !== null &&
    (plan.import.ready ||
      plan.import.confirmable ||
      (plan.import.environment.length > 0 && plan.import.blockedBy.includes('no-steps-selected')))
  // Run shows in the footer while the import is actionable but has not finished; Done otherwise.
  const showRun = step === 'import' && importStageShown && !importSucceeded && importStartable
  return (
    <div className="flex min-h-[16rem] flex-col gap-3">
      <SiteSetupStepRail current={step} />

      <div className="scrollbar-sleek max-h-[45vh] flex-1 space-y-3 overflow-y-auto pr-1">
        {!plan ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {strings.loading}
          </p>
        ) : null}

        {plan && step === 'stack' ? (
          isActionable(stackStage) ? (
            <SiteSetupStackStage
              siteId={siteId}
              suggestedDomain={plan.stack.suggestedDomain}
              // What the planner found on disk, so a folder agent-local already serves does not open
              // on a proposal to set it up with LocalWP.
              detectedStack={plan.stack.stack === 'agent-local' ? 'agent-local' : null}
              // Already managed by the detected stack? Then open on the stack it could move TO —
              // leaving the picker on the current one proposes a migration that cannot do anything.
              // Both stacks handle a folder with no WordPress yet: LocalWP creates an install, Agent
              // Local attaches the folder to an empty database for the import to fill.
              preferredStack={
                plan.stack.alreadyLocalWp ? (plan.stack.alternatives[0] ?? null) : null
              }
              onChoicePendingChange={setChoicePending}
              onBusyChange={setStageBusy}
              onMigrated={onMigrated}
            />
          ) : (
            <UnavailableRow
              icon={<HardDrive className="size-4" />}
              heading={strings.stackHeading}
              reason={stackStage?.reason ?? strings.unavailable}
            />
          )
        ) : null}

        {/* HTTPS sits between the stack and the import: it only means anything once a stack owns
            the site, and an untrusted certificate is what makes the local URL warn in the browser. */}
        {plan && step === 'https' ? (
          <SiteSetupHttpsStage
            cert={cert}
            trusting={trusting}
            onTrust={() => void runTrustCert()}
          />
        ) : null}

        {/* An empty step list is the one import block the user can clear from here, so it must not
            collapse into an unavailable row: the stage offers the toggles instead. Everything else
            (no environment, missing SSH password, missing checkout) is fixed elsewhere. */}
        {plan && step === 'import' ? (
          importStageShown ? (
            <SiteSetupImportStage
              ref={importStageRef}
              siteId={siteId}
              readiness={plan.import}
              onStepsChanged={replan}
              onBusyChange={setStageBusy}
              onStartableChange={setImportStartable}
              onSettledChange={setImportSucceeded}
            />
          ) : (
            <UnavailableRow
              icon={<Database className="size-4" />}
              heading={strings.importHeading}
              reason={importStage?.reason ?? strings.unavailable}
            />
          )
        ) : null}

        {error.length > 0 ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <SiteSetupStepNav
        current={step}
        busy={stageBusy || trusting}
        canAdvance={canAdvance}
        blockedReason={
          step === 'stack' && !stackSatisfied
            ? needsStackChoice
              ? strings.stackPickFirst
              : strings.stackSetUpFirst
            : strings.loading
        }
        onBack={goBack}
        onNext={goNext}
        onDone={onDone}
        onSkip={
          step === 'stack' ? (stackSatisfied ? undefined : skipStack) : showRun ? onDone : undefined
        }
        onRun={showRun ? () => importStageRef.current?.run() : undefined}
      />
    </div>
  )
}

export default SiteSetupContinuation
