// Screen 2 of the redesigned setup dialog: one screen, four rows, one primary button (the dialog
// shell owns the button — this component only owns the rows and the choices they edit).
//
// Every summary is written before anything has run (STYLEGUIDE "copy must not overclaim"): "will
// clone", "Create a LocalWP site", "Trust the certificate". The one row allowed to report a real
// past fact is HTTPS when the certificate is already trusted, because that comes from a live
// `LocalWpCertStatus`, not from what this run is about to do.

import { Download, Lock, Server } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { repoSlug } from '../../../../shared/site-local-domain'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import { SITE_IMPORT_TOGGLES, type SiteLocalStack } from '../../../../shared/site-types'
import { Checkbox } from '@/components/ui/checkbox'
import type { SetupRunStepId, SiteSetupChoices, SiteSetupSource } from './site-setup-choices'
import { getSiteSetupReviewStrings } from './site-setup-review-strings'
import { getSiteToggleLabels } from './site-toggle-labels'
import { joinDisplayPath } from './site-display-path'
import { SiteSetupNoStackFixes } from './SiteSetupNoStackFixes'
import { SiteSetupRow, SiteSetupRowList } from './SiteSetupRow'
import { SiteSetupServeEditToggle, SiteSetupServeEditor } from './SiteSetupServeEditor'
import { domainForStack } from './site-setup-stack-domain'

/** Written for the user, straight from the run planner's `blockedBy` (site-setup-plan.ts). */
const IMPORT_BLOCKED_REASON: Record<string, string> = {
  'no-environment': 'This site has no environment configured, so there is nothing to import from.',
  'no-steps-selected': 'No import steps are enabled for this environment — pick at least one.',
  'unmatched-branch':
    'The checked-out branch has no matching environment, so there is nothing to import from.'
}

/** Module scope so the default prop keeps referential equality across renders. */
const NO_LOCKED_STEPS: SetupRunStepId[] = []

export function SiteSetupReview({
  source,
  plan,
  availableStacks,
  cert,
  choices,
  onChange,
  lockedSteps = NO_LOCKED_STEPS,
  sourceRows,
  promptStackChoice = false,
  serveDomainError = ''
}: {
  source: SiteSetupSource
  /** Null for a repo source before checkout: rows then show 'will' phrasing from defaults. */
  plan: SiteSetupPlan | null
  availableStacks: SiteLocalStack[]
  cert: LocalWpCertStatus | null
  choices: SiteSetupChoices
  onChange: (next: SiteSetupChoices) => void
  /** Steps that already completed in a previous run (retry path): their rows render state 'locked'. */
  lockedSteps?: SetupRunStepId[]
  /** Rendered in place of the Clone row for a link source (the target radio + credentials rows). */
  sourceRows?: React.ReactNode
  /** Several stacks and nothing chose one: open the stack choice in the row from the start. */
  promptStackChoice?: boolean
  /** A naming rule or clash for the serve domain; it also opens the editor so the reason shows. */
  serveDomainError?: string
}): React.JSX.Element {
  const strings = getSiteSetupReviewStrings()
  const toggleLabels = getSiteToggleLabels()
  const [serveEditing, setServeEditing] = useState(promptStackChoice)
  useEffect(() => {
    if (promptStackChoice) {
      setServeEditing(true)
    }
  }, [promptStackChoice])

  const stepState = (id: SetupRunStepId): 'available' | 'locked' =>
    lockedSteps.includes(id) ? 'locked' : 'available'

  const serveUnavailableReason = plan && !plan.stack.supported ? plan.stack.reason : null
  const noStackInstalled = availableStacks.length === 0 && !serveUnavailableReason
  const serveReason = serveUnavailableReason ?? (noStackInstalled ? strings.serveNoStack : null)
  const serveDomain = choices.serve.domain
  const serveSummary =
    choices.serve.stack === 'agent-local'
      ? strings.serveAgentLocal.replace('{{domain}}', serveDomain)
      : choices.serve.stack === 'ddev'
        ? strings.serveDdev.replace('{{domain}}', serveDomain)
        : plan?.stack.alreadyLocalWp
          ? strings.serveAlreadyLocalWp.replace('{{domain}}', serveDomain)
          : strings.serveCreateLocalWp.replace('{{domain}}', serveDomain)

  // Nothing is ruled out on WordPress presence: Agent Local attaches a bare repo against an empty
  // database, which is what the no-WordPress block used to deny.
  const serveRuledOut: Partial<Record<SiteLocalStack, string>> = {}

  const httpsReason = cert && !cert.supported ? cert.reason : null
  const httpsAlreadyTrusted = cert?.trusted ?? false
  const httpsSummary = httpsAlreadyTrusted
    ? strings.httpsAlreadyTrusted.replace('{{domain}}', serveDomain)
    : strings.httpsTrust.replace('{{domain}}', serveDomain)

  // A link carries the server details the pre-bind record lacks, so its plan's import readiness
  // describes the wrong state; the runner re-plans after the bind is written.
  const importBlockedReason =
    source.kind !== 'link' && plan && !plan.import.ready && !plan.import.confirmable
      ? (plan.import.blockedBy.map((reason) => IMPORT_BLOCKED_REASON[reason]).find(Boolean) ?? null)
      : !plan && choices.import.environment === ''
        ? strings.importNoEnvironment
        : null
  // A branch that does not match the environment is worth saying, not blocking on: the run is
  // started with the environment named, which is what overrides the branch check.
  const importBranchNote =
    source.kind !== 'link' && plan?.import.confirmable === true
      ? plan.import.blockedBy.map((reason) => IMPORT_BLOCKED_REASON[reason]).join(' ')
      : ''
  const importCheckboxDisabled = stepState('import') === 'locked'

  // A bare clone carries no server configuration, so the row says what unlocks an import instead.
  const cloneHasNoServer = source.kind === 'repo'

  return (
    <SiteSetupRowList>
      {sourceRows ??
        (source.kind === 'repo' ? (
          <SiteSetupRow
            icon={<Download className="size-4" />}
            title={strings.cloneTitle}
            summary={`${source.repo.fullName} → ${joinDisplayPath(source.destinationRoot, repoSlug(source.repo.fullName))}`}
          />
        ) : null)}

      {serveReason ? (
        <SiteSetupRow
          icon={<Server className="size-4" />}
          title={strings.serveTitle}
          summary={serveSummary}
          state="unavailable"
          reason={serveReason}
          fixes={noStackInstalled ? <SiteSetupNoStackFixes /> : undefined}
        />
      ) : (
        <SiteSetupRow
          icon={<Server className="size-4" />}
          title={strings.serveTitle}
          summary={serveSummary}
          state={stepState('serve')}
          control={
            <>
              <SiteSetupServeEditToggle
                expanded={serveEditing}
                onToggle={() => setServeEditing((open) => !open)}
                disabled={stepState('serve') === 'locked' || !choices.serve.enabled}
              />
              <Checkbox
                checked={choices.serve.enabled}
                disabled={stepState('serve') === 'locked'}
                onCheckedChange={(checked) =>
                  onChange({ ...choices, serve: { ...choices.serve, enabled: checked === true } })
                }
              />
            </>
          }
        >
          {(serveEditing || serveDomainError) && choices.serve.enabled ? (
            <SiteSetupServeEditor
              error={serveDomainError}
              stacks={availableStacks}
              value={{ stack: choices.serve.stack, domain: choices.serve.domain }}
              ruledOut={serveRuledOut}
              onChange={(next) =>
                onChange({
                  ...choices,
                  serve: {
                    ...choices.serve,
                    stack: next.stack,
                    domain:
                      next.stack !== choices.serve.stack
                        ? domainForStack(next.domain, next.stack, choices.serve.stack)
                        : next.domain
                  }
                })
              }
            />
          ) : null}
        </SiteSetupRow>
      )}

      {choices.serve.enabled &&
        (httpsReason ? (
          <SiteSetupRow
            icon={<Lock className="size-4" />}
            title={strings.httpsTitle}
            summary={httpsSummary}
            state="unavailable"
            reason={httpsReason}
          />
        ) : (
          <SiteSetupRow
            icon={<Lock className="size-4" />}
            title={strings.httpsTitle}
            summary={httpsSummary}
            state={httpsAlreadyTrusted ? 'locked' : stepState('https')}
            control={
              <Checkbox
                checked={httpsAlreadyTrusted ? true : choices.https}
                disabled={httpsAlreadyTrusted || stepState('https') === 'locked'}
                onCheckedChange={(checked) => onChange({ ...choices, https: checked === true })}
              />
            }
          />
        ))}

      {cloneHasNoServer || importBlockedReason ? (
        <SiteSetupRow
          icon={<Download className="size-4" />}
          title={strings.importTitle}
          summary=""
          state="unavailable"
          reason={cloneHasNoServer ? strings.importAfterClone : (importBlockedReason ?? '')}
        />
      ) : (
        <SiteSetupRow
          icon={<Download className="size-4" />}
          title={strings.importTitle}
          summary={strings.importFrom.replace('{{environment}}', choices.import.environment)}
          state={stepState('import')}
          control={
            <Checkbox
              checked={choices.import.enabled}
              disabled={importCheckboxDisabled}
              onCheckedChange={(checked) =>
                onChange({
                  ...choices,
                  import: { ...choices.import, enabled: checked === true }
                })
              }
            />
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SITE_IMPORT_TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Checkbox
                  checked={choices.import.toggles[toggle.key]}
                  disabled={!choices.import.enabled || stepState('import') === 'locked'}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...choices,
                      import: {
                        ...choices.import,
                        toggles: { ...choices.import.toggles, [toggle.key]: checked === true }
                      }
                    })
                  }
                />
                {toggleLabels[toggle.key]}
              </label>
            ))}
          </div>
          {importBranchNote.length > 0 ? (
            <p className="text-xs text-muted-foreground">{importBranchNote}</p>
          ) : null}
        </SiteSetupRow>
      )}
    </SiteSetupRowList>
  )
}

export default SiteSetupReview
