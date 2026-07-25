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

export function buildSiteRunPlan(input: SiteRunPlanInput): SiteRunPlan {
  const { site, group, branch, pathExists } = input

  const resolution: SiteEnvironmentResolution = input.requestedEnvironment
    ? {
        environment: input.requestedEnvironment,
        reason: 'branch-match',
        requiresConfirmation: false
      }
    : resolveSiteEnvironment(site, branch)

  const environmentName = resolution.environment
  const environment: SiteEnvironment | undefined = environmentName
    ? site.environments[environmentName]
    : undefined

  const toggles = group === 'import' ? SITE_IMPORT_TOGGLES : SITE_DEPLOY_TOGGLES
  const steps: SiteRunPlanStep[] = toggles.map((toggle) => ({
    key: toggle.key,
    label: toggle.label,
    enabled: environment ? environment[toggle.key] : false,
    remote: Object.hasOwn(REMOTE_STEPS, toggle.key)
  }))

  const enabledStepCount = environment ? countSelectedToggles(environment, group) : 0
  const requiresRemote = steps.some((step) => step.enabled && step.remote)

  const blockedBy: SiteRunBlockedReason[] = []
  if (!environment) {
    blockedBy.push('no-environment')
  }
  if (enabledStepCount === 0) {
    blockedBy.push('no-steps-selected')
  }
  if (!pathExists) {
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
