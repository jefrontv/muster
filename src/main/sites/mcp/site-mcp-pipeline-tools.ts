// Read-only Bitbucket Pipelines status for a site.
//
// Wraps the module the Sites panel already uses, so an agent sees exactly what the panel shows.
// Nothing here can start, stop or retry a pipeline — the point is awareness: an agent that pushed
// can wait for the build and only then go and check the live site.

import { getSitePipelines } from '../../bitbucket/site-pipelines'
import { resolveSiteGitCheckoutDir } from '../site-summary'
import type {
  SitePipelineRun,
  SitePipelinesResult,
  SitePipelinesUnavailable
} from '../../../shared/site-types'
import { readString, resolveMcpSite, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpTool } from './site-mcp-context'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

/** Statuses that mean the run is still doing work, so polling again will tell you something new. */
const IN_FLIGHT: readonly SitePipelineRun['status'][] = ['running', 'pending', 'paused']

/**
 * What an agent should do about an unavailable result. Each of these is permanent for the site as
 * configured, so the answer is always "stop polling", but the reason decides what to say instead.
 */
const UNAVAILABLE_HINT: Record<SitePipelinesUnavailable, string> = {
  'not-bitbucket': "This site's git remote is not a Bitbucket repository.",
  'not-authenticated':
    'Muster has no Bitbucket credentials. Connect Bitbucket in Settings → Integrations, or set ORCA_BITBUCKET_ACCESS_TOKEN.',
  forbidden:
    "The Bitbucket credential lacks the 'pipeline' read scope, so pipeline runs cannot be read.",
  'not-found': 'Bitbucket has no such repository — the remote URL is probably stale after a rename.'
}

function describeRun(run: SitePipelineRun): Record<string, unknown> {
  return {
    build_number: run.buildNumber,
    status: run.status,
    in_flight: IN_FLIGHT.includes(run.status),
    branch: run.refName,
    commit: run.commitSha,
    trigger: run.trigger,
    created_on: run.createdOn,
    duration_seconds: run.durationSeconds,
    // Only ever set for a run still in flight; resolving it costs an extra call.
    current_step: run.currentStep,
    completed_steps: run.completedSteps,
    total_steps: run.totalSteps,
    url: run.url
  }
}

/**
 * A stored credential that cannot be decrypted is as permanent as having none — the user has to act
 * either way, so it degrades to `not-authenticated` instead of erroring on every poll.
 *
 * Deliberately narrow: a network blip or a Bitbucket 5xx must keep throwing, because retrying
 * those IS the right move and an agent told "unavailable" would stop.
 */
async function readPipelines(repoPath: string): Promise<SitePipelinesResult> {
  try {
    return await getSitePipelines(repoPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/credential|decrypt|keychain/i.test(message)) {
      return { available: false, reason: 'not-authenticated' }
    }
    throw error
  }
}

export const SITE_MCP_PIPELINE_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'get_site_pipelines',
    description:
      "Read-only Bitbucket Pipelines status for a site's checkout: the most recent runs, newest first, with the current step named while a run is still in flight. Use it to wait for a deploy you triggered — poll until the newest run has in_flight false, then check live_domain. Returns available=false with a reason rather than failing when the site is not on Bitbucket or has no credentials. Cannot start, stop or retry anything.",
    inputSchema: objectSchema({ ...SITE_PROPERTY }, []),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const result = await readPipelines(resolveSiteGitCheckoutDir(site))
      if (!result.available) {
        return {
          ok: true,
          available: false,
          reason: result.reason,
          detail: UNAVAILABLE_HINT[result.reason]
        }
      }

      // The live domain of the environment a run would target, so "the build passed, now check the
      // site" is one call rather than two. Same resolution the panel and every run tool use.
      const summary = await context.summarize(site)
      const resolvedName = summary.resolvedEnvironment.environment
      const environment = resolvedName ? site.environments[resolvedName] : undefined
      const newest = result.runs[0]
      return {
        ok: true,
        available: true,
        workspace: result.workspace,
        repo_slug: result.repoSlug,
        current_branch: summary.branch ?? null,
        environment: resolvedName,
        live_domain: environment?.liveDomain || null,
        // Hoisted because it is the one an agent waiting on a push actually cares about.
        newest_in_flight: newest ? IN_FLIGHT.includes(newest.status) : false,
        runs: result.runs.map((run) => describeRun(run))
      }
    }
  }
]
