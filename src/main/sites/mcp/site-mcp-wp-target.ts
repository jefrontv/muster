// Resolve a local WordPress root or a guarded remote SSH session for WP tools.
//
// Local ignores env: the checkout is not an environment. Remote is the deploy guard —
// unmatched branch refuses unless env= or confirm=true.

import type { Site } from '../../../shared/site-types'
import type { RemoteLayout, SiteRunConfig, SiteSshSession } from '../pipeline-contract'
import { resolveRemoteLayout } from '../remote-wordpress-layout'
import { buildSiteRunConfig, resolveSiteWpDir } from '../site-run-config'
import { buildSiteToolPlan, canStartRun } from '../site-run-plan'
import {
  readBoolean,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'

export type McpWpBlocked = {
  ok: false
  blocked: true
  needs_confirmation: boolean
  site: string
  site_id: string
  location: 'local' | 'remote'
  current_branch: string
  resolved_environment: string | null
  blocked_by: string[]
  message: string
}

export type McpRemoteWp = {
  site: Site
  environment: string
  config: SiteRunConfig
  session: SiteSshSession
  layout: RemoteLayout
}

function blockedMessage(
  plan: {
    blockedBy: string[]
    environment: string | null
    confirmable: boolean
  },
  branch: string | null
): string {
  if (plan.blockedBy.includes('missing-ssh-credentials')) {
    return `No SSH password is stored for '${plan.environment ?? '(none)'}'. Set it in Muster or turn on 'Use SSH key' for this environment; confirm=true does not override it.`
  }
  if (plan.blockedBy.includes('unmatched-branch')) {
    return `Branch '${branch ?? '(none)'}' matches no environment, so this would run on '${plan.environment}' by fallback (which may be production). Re-call with env='${plan.environment}' to target it explicitly, or confirm=true to accept the fallback.`
  }
  if (plan.blockedBy.includes('missing-path')) {
    return 'The local checkout is not on disk.'
  }
  return 'This site has no environment to run against.'
}

export function resolveMcpLocalWp(
  context: SiteMcpContext,
  args: ToolArguments
): { site: Site; wpDir: string; dbSocket: string } {
  const site = resolveMcpSite(context, readString(args, 'site'))
  return {
    site,
    wpDir: resolveSiteWpDir(site),
    dbSocket: site.dbSocket
  }
}

export async function openMcpRemoteWp(
  context: SiteMcpContext,
  args: ToolArguments,
  step: { key: string; label: string }
): Promise<{ ok: true; target: McpRemoteWp } | { ok: false; blocked: McpWpBlocked }> {
  const site = resolveMcpSite(context, readString(args, 'site'))
  const requested = readString(args, 'env')
  if (requested.length > 0 && !Object.hasOwn(site.environments, requested)) {
    throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
      available_environments: Object.keys(site.environments)
    })
  }
  const summary = await context.summarize(site)
  const plan = buildSiteToolPlan({
    site,
    group: 'deploy',
    step: { ...step, remote: true },
    branch: summary.branch,
    requestedEnvironment: requested.length > 0 ? requested : null,
    hasSshSecret: (environment) => context.hasSshSecret(site.id, environment),
    pathExists: summary.pathExists
  })
  if (!canStartRun(plan, readBoolean(args, 'confirm')) || !plan.environment) {
    return {
      ok: false,
      blocked: {
        ok: false,
        blocked: true,
        needs_confirmation: plan.confirmable,
        site: site.displayName,
        site_id: site.id,
        location: 'remote',
        current_branch: summary.branch ?? '',
        resolved_environment: plan.environment,
        blocked_by: plan.blockedBy,
        message: blockedMessage(plan, summary.branch)
      }
    }
  }
  const config = await buildSiteRunConfig(site, plan.environment, 'deploy')
  const controller = new AbortController()
  const session = await context.openSshSession(config, controller.signal)
  try {
    const layout = await resolveRemoteLayout(session, config.environment.rootPath)
    return { ok: true, target: { site, environment: plan.environment, config, session, layout } }
  } catch (error) {
    await session.close().catch(() => undefined)
    throw error
  }
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  let out = value
  for (const secret of secrets) {
    if (secret.length > 0) {
      out = out.split(secret).join('***')
    }
  }
  return out
}
