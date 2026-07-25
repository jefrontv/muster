// Run history and job control: list_recent_runs, get_run_log, list_jobs, get_job_status, cancel_job.
// Ported from ocsites mcp_server.py:3309-3430.
//
// ocsites' "jobs" were forked worker processes with their own JSON records; Muster already has the
// same thing in the run service plus site-run-log, so a job IS a run and job_id IS run_id. Reads go
// through the persisted log, which makes them correct across processes: a run started in the Muster
// window is visible here, and vice versa. Only liveness and cancellation are process-local, and
// both are reported honestly rather than guessed.

import type { SiteRun } from '../../../shared/site-run-types'
import { readNumber, readRequiredString, readString, resolveMcpSite } from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import {
  JOB_ID_PROPERTY,
  LIMIT_PROPERTY,
  objectSchema,
  RUN_ID_PROPERTY,
  SITE_PROPERTY
} from './site-mcp-schemas'

const DEFAULT_RUN_LIMIT = 20
const MAX_RUN_LIMIT = 100
const DEFAULT_LOG_LINES = 500
const MAX_LOG_LINES = 5_000
const DEFAULT_JOB_LOG_LINES = 50

const TERMINAL_STATUSES: readonly string[] = ['succeeded', 'failed', 'cancelled', 'blocked']

type LocatedRun = { run: SiteRun; live: boolean }

/**
 * Runs are stored per site, so a bare run_id has to be located. Live runs answer immediately; a
 * finished one is found by asking each site's log directory, which is a cheap stat per site.
 */
function locateRun(
  context: SiteMcpContext,
  runId: string,
  siteSelector: string
): LocatedRun | null {
  const active = context.listActiveRuns().find((entry) => entry.run.id === runId)
  if (active) {
    return { run: active.run, live: true }
  }
  const sites =
    siteSelector.length > 0 ? [resolveMcpSite(context, siteSelector)] : context.store.listSites()
  for (const site of sites) {
    const found = context.readRunLog(site.id, runId, 0).run
    if (found) {
      return { run: found, live: false }
    }
  }
  return null
}

function describeRun(run: SiteRun, live: boolean): Record<string, unknown> {
  return {
    job_id: run.id,
    run_id: run.id,
    site: run.siteName,
    site_id: run.siteId,
    group: run.group,
    environment: run.environment,
    branch: run.branch ?? '',
    status: run.status,
    live,
    started_at: run.startedAt,
    finished_at: run.endedAt,
    duration_seconds:
      run.endedAt === null ? null : Math.round((run.endedAt - run.startedAt) / 1000),
    ok: run.status === 'succeeded',
    error: run.error
  }
}

export const SITE_MCP_JOB_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_recent_runs',
    description:
      'List the most recent persisted import/deploy runs for a site: run id, group, environment, branch, start time, outcome, and duration.',
    inputSchema: objectSchema({ ...SITE_PROPERTY, ...LIMIT_PROPERTY }),
    run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const limit = readNumber(args, 'limit', DEFAULT_RUN_LIMIT, MAX_RUN_LIMIT)
      const liveIds = new Set(context.listActiveRuns().map((entry) => entry.run.id))
      const runs = context.listRuns(site.id, Math.max(1, limit))
      return Promise.resolve({
        ok: true,
        site: site.displayName,
        site_id: site.id,
        count: runs.length,
        runs: runs.map((run) => describeRun(run, liveIds.has(run.id)))
      })
    }
  },
  {
    name: 'get_run_log',
    description:
      'Read the persisted log for one run: the tail of its output, how many earlier lines were dropped, and the index of the first error line.',
    inputSchema: objectSchema(
      {
        ...RUN_ID_PROPERTY,
        ...SITE_PROPERTY,
        max_lines: { type: 'integer', description: 'Tail size; the most recent lines are kept.' }
      },
      ['run_id']
    ),
    run(context, args) {
      const runId = readRequiredString(args, 'run_id')
      const located = locateRun(context, runId, readString(args, 'site'))
      if (!located) {
        return Promise.resolve({ ok: false, error: `Run not found: ${runId}` })
      }
      const maxLines = readNumber(args, 'max_lines', DEFAULT_LOG_LINES, MAX_LOG_LINES)
      const page = context.readRunLog(located.run.siteId, runId, maxLines)
      return Promise.resolve({
        ok: true,
        ...describeRun(located.run, located.live),
        lines: page.lines,
        truncated_earlier: page.truncatedEarlier,
        first_error_index: page.firstErrorIndex
      })
    }
  },
  {
    name: 'list_jobs',
    description:
      'List recent import/deploy jobs newest first. Omit site to list across every configured site. A job id is a run id.',
    inputSchema: objectSchema({ ...SITE_PROPERTY, ...LIMIT_PROPERTY }),
    run(context, args) {
      const selector = readString(args, 'site')
      const limit = Math.max(1, readNumber(args, 'limit', DEFAULT_RUN_LIMIT, MAX_RUN_LIMIT))
      const sites =
        selector.length > 0 ? [resolveMcpSite(context, selector)] : context.store.listSites()
      const liveIds = new Set(context.listActiveRuns().map((entry) => entry.run.id))
      const runs = sites
        .flatMap((site) => context.listRuns(site.id, limit))
        .sort((left, right) => right.startedAt - left.startedAt)
        .slice(0, limit)
      return Promise.resolve({
        ok: true,
        count: runs.length,
        jobs: runs.map((run) => describeRun(run, liveIds.has(run.id)))
      })
    }
  },
  {
    name: 'get_job_status',
    description:
      "Return the status of an import/deploy job plus a tail of its log. Status is 'running', 'succeeded', 'failed', 'cancelled' or 'blocked'. If it is still running, report that and stop — do not poll again unless the user asked you to wait.",
    inputSchema: objectSchema(
      {
        ...JOB_ID_PROPERTY,
        ...SITE_PROPERTY,
        max_log_lines: { type: 'integer', description: 'Log lines to include; 0 for none.' }
      },
      ['job_id']
    ),
    run(context, args) {
      const jobId = readRequiredString(args, 'job_id')
      const located = locateRun(context, jobId, readString(args, 'site'))
      if (!located) {
        return Promise.resolve({ ok: false, error: `Job not found: ${jobId}` })
      }
      const maxLines = readNumber(args, 'max_log_lines', DEFAULT_JOB_LOG_LINES, MAX_LOG_LINES)
      const page = context.readRunLog(located.run.siteId, jobId, maxLines)
      const progress = context.listActiveRuns().find((entry) => entry.run.id === jobId)?.progress
      return Promise.resolve({
        ok: true,
        ...describeRun(located.run, located.live),
        finished: TERMINAL_STATUSES.includes(located.run.status),
        progress: progress ?? null,
        log: page.lines,
        truncated_earlier: page.truncatedEarlier,
        first_error_index: page.firstErrorIndex
      })
    }
  },
  {
    name: 'cancel_job',
    description:
      'Cancel a running import/deploy job. Only jobs started by this process can be signalled; a job owned by the Muster window must be cancelled there.',
    inputSchema: objectSchema({ ...JOB_ID_PROPERTY, ...SITE_PROPERTY }, ['job_id']),
    run(context, args) {
      const jobId = readRequiredString(args, 'job_id')
      const located = locateRun(context, jobId, readString(args, 'site'))
      if (!located) {
        return Promise.resolve({ ok: false, error: `Job not found: ${jobId}` })
      }
      if (TERMINAL_STATUSES.includes(located.run.status)) {
        return Promise.resolve({
          ok: true,
          job_id: jobId,
          status: located.run.status,
          message: 'Job already finished.'
        })
      }
      if (!located.live) {
        return Promise.resolve({
          ok: false,
          job_id: jobId,
          status: located.run.status,
          error:
            'This job is owned by another Muster process. Cancel it from the Muster run console.'
        })
      }
      const cancelled = context.cancelRun(jobId)
      return Promise.resolve({
        ok: cancelled,
        job_id: jobId,
        status: cancelled ? 'cancelling' : located.run.status,
        ...(cancelled ? {} : { error: 'Job is already stopping.' })
      })
    }
  }
]
