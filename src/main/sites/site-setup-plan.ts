// The planner behind the guided `muster://configure` setup: one read that answers "what can this
// link still do for this site, and what is stopping each stage".
//
// Nothing here re-derives a judgement. The stack stage asks detectSiteStack, the import stage
// asks buildSiteRunPlan/canStartRun — the very producers the real actions gate on — so the wizard
// physically cannot offer a button the action itself would refuse. Ported from the ocsites flow,
// where the same four questions were answered ad hoc at each prompt and drifted apart.

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SiteRunBlockedReason } from '../../shared/site-run-types'
import type {
  SiteSetupCloneResolution,
  SiteSetupImportReadiness,
  SiteSetupPlan,
  SiteSetupStackReadiness,
  SiteSetupStage
} from '../../shared/site-setup-flow-types'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import type { Site, SiteLocalStack } from '../../shared/site-types'
import { requireSite } from '../ipc/sites-result'
import type { Store } from '../persistence'
import { detectSiteStack } from './local-stack-detection'
import { localStackProviders } from './local-stack-provider'
import { LOCALWP_UNSUPPORTED_PLATFORM } from './localwp-host'
import { defaultLocalDomain } from './site-bind-url'
import { buildSiteRunPlan, canStartRun } from './site-run-plan'
import { getSiteSecretPresence } from './site-secret-store'
import { resolveSiteSetupCloneTargets } from './site-setup-clone-targets'

/** Written for the user, not the log: each one names the thing they have to go and do. */
const IMPORT_BLOCKED_REASON: Record<SiteRunBlockedReason, string> = {
  'no-environment': 'This site has no environment configured, so there is nothing to import from.',
  'no-steps-selected': 'No import steps are enabled for this environment — pick at least one.',
  'unmatched-branch':
    'The checked-out branch does not match an environment — confirm the target before importing.',
  'missing-ssh-credentials': 'Add the SSH password for this environment before importing.',
  'missing-path': 'The local checkout is not on disk yet — pick or clone the folder first.'
}

// Matches the wording localwp-migration-plan.ts refuses with, so the wizard and the migration
// itself explain the same no-op the same way.
const ALREADY_LOCALWP_REASON = 'This project is already a LocalWP site.'
const ALREADY_AGENT_LOCAL_REASON = 'This project is already an Agent Local site.'

export type SiteSetupPlanInput = {
  siteId: string
  /** From the link's `reponame=`; drives the clone stage only. */
  reponame: string
  /** Checked-out branch, or null when unknown — null resolves as an unmatched branch. */
  branch: string | null
}

export async function buildSiteSetupPlan(
  store: Store,
  input: SiteSetupPlanInput
): Promise<SiteSetupPlan> {
  const site = requireSite(store, input.siteId)

  // Both probes touch the machine (Local's config, the connector's API) and neither feeds the
  // other, so they run together rather than serialising the dialog's first paint.
  const [detection, clone, installed] = await Promise.all([
    // Every stack, not just LocalWP: asking only LocalWP reported a folder agent-local already
    // serves as unmanaged, so the wizard offered to set up a site that was already set up.
    detectSiteStack(site.path),
    resolveCloneTargets(input.reponame),
    installedStacks()
  ])

  const pathExists = existsSync(site.path)
  const stack = buildStackReadiness(site, detection, installed)
  const importReadiness = buildImportReadiness(site, input.branch, pathExists)

  return {
    siteId: site.id,
    stages: [
      // The checkout is the one thing a link cannot conjure: without it the user must pick a
      // folder or clone one, which is exactly what 'active' means.
      { id: 'target', state: pathExists ? 'done' : 'active', reason: '' },
      // requireSite threw if the record was missing, so reaching here *is* the bind being done.
      { id: 'bind', state: 'done', reason: '' },
      buildStackStage(stack),
      buildImportStage(importReadiness)
    ],
    clone,
    stack,
    import: importReadiness
  }
}

/**
 * A connector that is missing, misconfigured, or simply down must never sink the whole plan: the
 * other three stages stay actionable without a clone target, so a throw degrades to "none found".
 */
async function resolveCloneTargets(reponame: string): Promise<SiteSetupCloneResolution> {
  try {
    return await resolveSiteSetupCloneTargets(reponame)
  } catch (error) {
    return {
      connectorConfigured: false,
      targets: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/** The stacks this machine can actually run, so the stage knows whether a switch is on offer. */
async function installedStacks(): Promise<SiteLocalStack[]> {
  const answers = await Promise.all(
    localStackProviders()
      .filter((provider) => provider.id !== 'plain' && provider.id !== 'mamp')
      .map(async (provider) => ((await provider.isAvailable().catch(() => false)) ? provider.id : null))
  )
  return answers.filter((id): id is SiteLocalStack => id !== null)
}

function buildStackReadiness(
  site: Site,
  detection: LocalWpStackDetection,
  installed: SiteLocalStack[]
): SiteSetupStackReadiness {
  // Managed by either stack: the certificate stage needs to know which one so it asks that stack
  // about the domain rather than always asking LocalWP.
  const managedStack = detection.stack === 'localwp' || detection.stack === 'agent-local'
  const alreadyLocalWp = managedStack
  return {
    supported: detection.supported,
    alreadyLocalWp,
    // Where the folder could go instead. With two stacks installed, "LocalWP already has this" is
    // no longer the end of the conversation — it is the reason to offer Agent Local.
    alternatives: installed.filter((id) => id !== detection.stack),
    stack: detection.stack,
    // Local rejects a blank domain, so fall back to the folder name rather than offering nothing —
    // through ocsites' own default_local_domain, so a domain-shaped folder gives acme.local rather
    // than acme.com.au.local.
    suggestedDomain: site.localDomain.trim() || defaultLocalDomain(path.basename(site.path)),
    // `reason` is only a contract when the stage is closed, and the type does not promise
    // detection filled it in, so the platform message is the floor.
    // Name the stack that actually owns it: "already a LocalWP site" was shown for agent-local
    // folders too, which reads as a detection bug to anyone who knows their own setup.
    reason: !detection.supported
      ? detection.reason || LOCALWP_UNSUPPORTED_PLATFORM
      : alreadyLocalWp
        ? detection.stack === 'agent-local'
          ? ALREADY_AGENT_LOCAL_REASON
          : ALREADY_LOCALWP_REASON
        : ''
  }
}

function buildImportReadiness(
  site: Site,
  branch: string | null,
  pathExists: boolean
): SiteSetupImportReadiness {
  const plan = buildSiteRunPlan({
    site,
    group: 'import',
    branch,
    hasSshSecret: (environment) => getSiteSecretPresence(site.id, environment).ssh,
    pathExists
  })
  return {
    // `false`: the wizard reports what an unconfirmed run would do, and surfaces the override
    // separately once `confirmable` says one is even allowed.
    ready: canStartRun(plan, false),
    blockedBy: plan.blockedBy,
    confirmable: plan.confirmable,
    environment: plan.environment ?? '',
    enabledStepCount: plan.steps.filter((step) => step.enabled).length
  }
}

function buildStackStage(stack: SiteSetupStackReadiness): SiteSetupStage {
  // Both cases are dead ends rather than obstacles: no amount of user action makes a LocalWP
  // migration meaningful off macOS or on a site Local already manages.
  // Closed only when there is genuinely nothing to choose: the platform cannot run a stack, or one
  // already manages the folder and no other installed stack could take it. Closing it merely
  // because LocalWP got there first is what stopped a user moving a site onto Agent Local.
  if (!stack.supported || (stack.alreadyLocalWp && stack.alternatives.length === 0)) {
    return { id: 'stack', state: 'unavailable', reason: stack.reason }
  }
  return { id: 'stack', state: 'pending', reason: '' }
}

function buildImportStage(readiness: SiteSetupImportReadiness): SiteSetupStage {
  if (readiness.ready) {
    return { id: 'import', state: 'pending', reason: '' }
  }
  return {
    id: 'import',
    state: 'blocked',
    reason: readiness.blockedBy.map((entry) => IMPORT_BLOCKED_REASON[entry]).join(' ')
  }
}
