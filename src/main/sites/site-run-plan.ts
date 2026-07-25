// What a run *would* do, and whether it is allowed to start.
//
// This is ocsites' `preview_run` plus its accidental-prod-deploy guard, ported together because
// they answer the same question. Both the UI and the agent-facing MCP tools call this before any
// run, so there is exactly one place that decides "is this safe to execute".

import {
  countSelectedToggles,
  resolveSiteEnvironment,
  SITE_DEPLOY_TOGGLES,
  SITE_IMPORT_TOGGLES,
  type Site,
  type SiteEnvironment,
  type SiteEnvironmentResolution,
  type SiteRunGroup
} from '../../shared/site-types'

export type SiteRunPlanStep = {
  key: string
  label: string
  /** False when the toggle is off — shown greyed rather than hidden, so the plan is auditable. */
  enabled: boolean
  /** True when the step talks to the remote host; drives the "needs SSH" summary. */
  remote: boolean
}

export type SiteRunBlockedReason =
  | 'no-environment'
  | 'no-steps-selected'
  | 'unmatched-branch'
  | 'missing-ssh-credentials'
  | 'missing-path'

export type SiteRunPlan = {
  siteId: string
  group: SiteRunGroup
  environment: string | null
  resolution: SiteEnvironmentResolution
  steps: SiteRunPlanStep[]
  enabledStepCount: number
  requiresRemote: boolean
  /** Empty when the run may proceed. Any entry blocks it unless explicitly confirmed. */
  blockedBy: SiteRunBlockedReason[]
  /** True when `blockedBy` holds only `unmatched-branch`, which an explicit confirm can override. */
  confirmable: boolean
}

// Which steps need SSH. A local-only run (search-replace + upload rewrite after a manual DB
// import) must not demand a remote host — ocsites backup.py:459 `needs_remote`.
const REMOTE_STEPS: Record<string, true> = {
  exportDatabase: true,
  exportFiles: true,
  deployThemes: true,
  gitPullOnServer: true,
  clearServerCache: true
}

export type SiteRunPlanInput = {
  site: Site
  group: SiteRunGroup
  branch: string | null
  /** Explicit target; skips branch inference entirely, as the MCP `env=` argument does. */
  requestedEnvironment?: string | null
  hasSshSecret: (environment: string) => boolean
  pathExists: boolean
}

/** One step of work a tool performs. A tool has exactly one; a run has a toggle list. */
export type SiteToolStep = {
  key: string
  label: string
  /** False for a purely local action (WP-CLI against the checkout), which needs no credentials. */
  remote: boolean
}

export type SiteToolPlanInput = SiteRunPlanInput & {
  step: SiteToolStep
}

/** Resolved per plan, because which steps exist depends on the environment that was resolved. */
type PlanSteps = {
  steps: SiteRunPlanStep[]
  enabledStepCount: number
}

export function buildSiteRunPlan(input: SiteRunPlanInput): SiteRunPlan {
  const toggles = input.group === 'import' ? SITE_IMPORT_TOGGLES : SITE_DEPLOY_TOGGLES
  return buildPlan(input, (environment) => ({
    steps: toggles.map((toggle) => ({
      key: toggle.key,
      label: toggle.label,
      enabled: environment ? environment[toggle.key] : false,
      remote: Object.hasOwn(REMOTE_STEPS, toggle.key)
    })),
    enabledStepCount: environment ? countSelectedToggles(environment, input.group) : 0
  }))
}

/**
 * The gate for a tool action — uploads pull, plugin pull, mutating WP-CLI. Deliberately the same
 * body as a run's plan, so one place decides "is this safe to execute", with the tool's single step
 * substituted for the import/deploy toggle list a tool does not have: judging a uploads pull by
 * `no-steps-selected` would block every one of them.
 */
export function buildSiteToolPlan({ step, ...input }: SiteToolPlanInput): SiteRunPlan {
  return buildPlan(input, () => ({
    steps: [{ ...step, enabled: true }],
    enabledStepCount: 1
  }))
}

function buildPlan(
  input: SiteRunPlanInput,
  buildSteps: (environment: SiteEnvironment | undefined) => PlanSteps
): SiteRunPlan {
  const { site, group } = input
  const resolution: SiteEnvironmentResolution = input.requestedEnvironment
    ? {
        environment: input.requestedEnvironment,
        reason: 'branch-match',
        requiresConfirmation: false
      }
    : resolveSiteEnvironment(site, input.branch)

  const environmentName = resolution.environment
  const environment: SiteEnvironment | undefined = environmentName
    ? site.environments[environmentName]
    : undefined

  const { steps, enabledStepCount } = buildSteps(environment)
  const requiresRemote = steps.some((step) => step.enabled && step.remote)

  const blockedBy: SiteRunBlockedReason[] = []
  if (!environment) {
    blockedBy.push('no-environment')
  }
  if (enabledStepCount === 0) {
    blockedBy.push('no-steps-selected')
  }
  if (!input.pathExists) {
    blockedBy.push('missing-path')
  }
  if (requiresRemote && environmentName && !input.hasSshSecret(environmentName)) {
    blockedBy.push('missing-ssh-credentials')
  }
  // An explicit environment is a deliberate choice, so it never trips the branch guard.
  if (!input.requestedEnvironment && resolution.requiresConfirmation && environment) {
    blockedBy.push('unmatched-branch')
  }

  return {
    siteId: site.id,
    group,
    environment: environmentName,
    resolution,
    steps,
    enabledStepCount,
    requiresRemote,
    blockedBy,
    confirmable: blockedBy.length > 0 && blockedBy.every((reason) => reason === 'unmatched-branch')
  }
}

/**
 * The gate every run must pass. `confirmed` corresponds to ocsites' `confirm=true`: it overrides
 * an unmatched branch and nothing else, so a missing credential or an empty step list still stops.
 */
export function canStartRun(plan: SiteRunPlan, confirmed: boolean): boolean {
  if (plan.blockedBy.length === 0) {
    return true
  }
  return confirmed && plan.confirmable
}
