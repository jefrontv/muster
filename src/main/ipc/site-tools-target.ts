// Which site, which environment, and may this tool run against it.
//
// Every site-tool handler starts here, so environment resolution and the accidental-prod guard are
// decided in one place instead of once per channel. Read-only tools resolve a target and stop;
// anything that writes also passes assertSiteToolAllowed, which is buildSiteToolPlan + canStartRun —
// the same gate an import or deploy goes through.

import type { Site, SiteRunGroup, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { SiteRunConfig } from '../sites/pipeline-contract'
import { buildSiteRunConfig } from '../sites/site-run-config'
import {
  buildSiteToolPlan,
  canStartRun,
  type SiteRunBlockedReason,
  type SiteToolStep
} from '../sites/site-run-plan'
import { buildSiteSummary } from '../sites/site-summary'
import { requireSite } from './sites-result'

export type SiteToolTarget = {
  site: Site
  summary: SiteSummary
  environment: string
  /** Secrets already decrypted, as every tool that talks to the server needs them. */
  config: SiteRunConfig
}

const BLOCKED_EXPLANATION: Record<SiteRunBlockedReason, string> = {
  'no-environment': 'the site has no environment configured',
  'no-steps-selected': 'there is nothing to do',
  'unmatched-branch':
    'the checked-out branch does not match an environment — confirm the target explicitly',
  'missing-ssh-credentials': 'no SSH password is stored for this environment',
  'missing-path': 'the local checkout is not on disk'
}

export async function resolveSiteToolTarget(
  store: Store,
  siteId: string,
  requestedEnvironment: string | null,
  group: SiteRunGroup
): Promise<SiteToolTarget> {
  const site = requireSite(store, siteId)
  const summary = await buildSiteSummary(site)
  const environment = requestedEnvironment ?? summary.resolvedEnvironment.environment
  if (!environment) {
    throw new Error(`Site has no environment to target: ${site.displayName}`)
  }
  if (!Object.hasOwn(site.environments, environment)) {
    throw new Error(`Unknown environment: ${environment}`)
  }
  return {
    site,
    summary,
    environment,
    config: await buildSiteRunConfig(site, environment, group)
  }
}

export type SiteToolGuardInput = {
  target: SiteToolTarget
  step: SiteToolStep
  group: SiteRunGroup
  /** An explicit environment is a deliberate choice and never trips the branch guard. */
  requestedEnvironment: string | null
  confirmed: boolean
}

/** Throws with the reasons when the run guard refuses; returns silently when it may proceed. */
export function assertSiteToolAllowed(input: SiteToolGuardInput): void {
  const { target } = input
  const plan = buildSiteToolPlan({
    site: target.site,
    group: input.group,
    branch: target.summary.branch,
    requestedEnvironment: input.requestedEnvironment,
    hasSshSecret: (environment) => target.summary.secrets[environment]?.ssh === true,
    pathExists: target.summary.pathExists,
    step: input.step
  })
  if (canStartRun(plan, input.confirmed)) {
    return
  }
  const reasons = plan.blockedBy.map((reason) => BLOCKED_EXPLANATION[reason]).join('; ')
  throw new Error(`Refusing ${input.step.label} against "${target.environment}": ${reasons}.`)
}
