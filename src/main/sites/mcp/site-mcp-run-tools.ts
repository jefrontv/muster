// preview_run, run_import_functions, run_deploy_functions. Ported from ocsites mcp_server.py:2796.
//
// The safety model is not re-derived here. buildSiteRunPlan decides what a run would do and what
// blocks it; canStartRun decides whether `confirm` may override that. `confirm` overrides an
// unmatched branch and nothing else — a missing SSH credential, an empty step list, a missing
// checkout or a missing environment still refuse, which is the whole point of the guard.
//
// A refusal returns the environment the run *would* have used plus the full dry-run preview, so
// the agent can show the user a concrete plan instead of guessing what confirm=true would do.

import type { SiteRunGroup } from '../../../shared/site-types'
import {
  readBoolean,
  readRunGroup,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { buildSiteRunPlan, canStartRun, type SiteRunPlan } from '../site-run-plan'
import {
  CONFIRM_PROPERTY,
  ENV_PROPERTY,
  GROUP_PROPERTY,
  objectSchema,
  SITE_PROPERTY
} from './site-mcp-schemas'
import { buildRunPreview, describeResolution } from './site-mcp-views'

type PlannedRun = {
  plan: SiteRunPlan
  preview: Record<string, unknown>
  branch: string | null
  siteName: string
  siteId: string
}

async function planRun(
  context: SiteMcpContext,
  args: ToolArguments,
  group: SiteRunGroup
): Promise<PlannedRun> {
  const site = resolveMcpSite(context, readString(args, 'site'))
  const requested = readString(args, 'env')
  if (requested.length > 0 && !Object.hasOwn(site.environments, requested)) {
    throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
      available_environments: Object.keys(site.environments)
    })
  }
  const summary = await context.summarize(site)
  const plan = buildSiteRunPlan({
    site,
    group,
    branch: summary.branch,
    requestedEnvironment: requested.length > 0 ? requested : null,
    hasSshSecret: (environment) => context.hasSshSecret(site.id, environment),
    pathExists: summary.pathExists
  })
  return {
    plan,
    preview: buildRunPreview(summary, plan),
    branch: summary.branch,
    siteName: site.displayName,
    siteId: site.id
  }
}

/** One sentence per blocker, so a model can relay the actual fix rather than "it failed". */
function describeBlockers(planned: PlannedRun, group: SiteRunGroup): string {
  const { plan } = planned
  const environment = plan.environment ?? '(none)'
  const branch = planned.branch && planned.branch.length > 0 ? planned.branch : '(none)'
  return plan.blockedBy
    .map((reason) => {
      switch (reason) {
        case 'no-environment':
          return 'This site has no environment to target. Create one with create_environment.'
        case 'no-steps-selected':
          return `No ${group} steps are enabled for '${environment}'. Enable some with set_deployment_toggles.`
        case 'missing-path':
          return 'The local checkout no longer exists on disk.'
        case 'missing-ssh-credentials':
          return `No SSH password is stored for '${environment}'. Set it in Muster; it cannot be set over MCP and confirm=true does not override it.`
        case 'unmatched-branch':
          return `Branch '${branch}' matches no environment, so this would target '${environment}' by fallback (which may be production). Re-call with env='${environment}' to target it explicitly, or confirm=true to accept the fallback.`
      }
    })
    .join(' ')
}

async function startGroupRun(
  context: SiteMcpContext,
  args: ToolArguments,
  group: SiteRunGroup
): Promise<Record<string, unknown>> {
  const planned = await planRun(context, args, group)
  const { plan } = planned
  const confirmed = readBoolean(args, 'confirm')
  if (!canStartRun(plan, confirmed) || !plan.environment) {
    return {
      ok: false,
      blocked: true,
      needs_confirmation: plan.confirmable,
      site: planned.siteName,
      site_id: planned.siteId,
      group,
      current_branch: planned.branch ?? '',
      resolved_environment: plan.environment,
      resolution_reason: describeResolution(plan.resolution, planned.branch),
      blocked_by: plan.blockedBy,
      message: describeBlockers(planned, group),
      preview: planned.preview
    }
  }
  const run = context.startRun({
    siteId: planned.siteId,
    siteName: planned.siteName,
    group,
    environment: plan.environment,
    branch: planned.branch
  })
  return {
    ok: true,
    started: true,
    run_id: run.id,
    job_id: run.id,
    status: run.status,
    site: planned.siteName,
    site_id: planned.siteId,
    group,
    environment: plan.environment,
    current_branch: planned.branch ?? '',
    started_at: run.startedAt,
    poll_with: 'get_job_status',
    message:
      'Run started. Report the run_id and status to the user and stop; poll get_job_status only if they ask you to wait.',
    preview: planned.preview
  }
}

const RUN_SCHEMA = objectSchema({ ...SITE_PROPERTY, ...ENV_PROPERTY, ...CONFIRM_PROPERTY })

export const SITE_MCP_RUN_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'preview_run',
    description:
      'Dry-run an import or deploy: the resolved environment, the remote target, every step in execution order, and anything currently blocking the run. Connects to nothing. Use before run_import_functions / run_deploy_functions.',
    inputSchema: objectSchema({ ...SITE_PROPERTY, ...GROUP_PROPERTY, ...ENV_PROPERTY }),
    async run(context, args) {
      const group = readRunGroup(args, 'group')
      return (await planRun(context, args, group)).preview
    }
  },
  {
    name: 'run_import_functions',
    description:
      'Run the enabled import steps for a site (pull the server database and files down to local). With env omitted the environment is inferred from the checked-out git branch; if the branch matches no environment the call is REFUSED and returns the environment it would have used plus a dry-run preview, unless confirm=true. Returns a run_id to poll with get_job_status.',
    inputSchema: RUN_SCHEMA,
    run(context, args) {
      return startGroupRun(context, args, 'import')
    }
  },
  {
    name: 'run_deploy_functions',
    description:
      'Run the enabled deploy steps for a site (build and upload the theme, git pull on the server, clear caches). Deploys push code to a live host, so with env omitted and a branch matching no environment the call is REFUSED with a preview unless confirm=true. Prefer passing env= after showing the user preview_run. Returns a run_id to poll with get_job_status.',
    inputSchema: RUN_SCHEMA,
    run(context, args) {
      return startGroupRun(context, args, 'deploy')
    }
  }
]
