// The agent-facing contract for pipeline awareness: a clear "keep waiting" signal, the live domain
// to check once waiting is over, and a reason instead of an error when there is nothing to read.

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment } from '../../../shared/site-types'
import type {
  Site,
  SitePipelineRun,
  SitePipelinesResult,
  SiteSummary
} from '../../../shared/site-types'
import type { SiteMcpContext } from './site-mcp-context'

const getSitePipelinesMock = vi.hoisted(() => vi.fn())
vi.mock('../../bitbucket/site-pipelines', () => ({ getSitePipelines: getSitePipelinesMock }))

// Static: vi.mock is hoisted above these, so the mock is in place before either module loads.
import { SITE_MCP_PIPELINE_TOOLS } from './site-mcp-pipeline-tools'
import { dispatchSiteMcpTool } from './site-mcp-tools'

function site(): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: '',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'production',
    environments: {
      production: { ...createEmptySiteEnvironment(), liveDomain: 'acme.com.au' },
      staging: { ...createEmptySiteEnvironment(), liveDomain: 'staging.acme.com.au' }
    },
    notes: '',
    searchReplaceTimeoutSeconds: 0
  }
}

function run(overrides: Partial<SitePipelineRun> = {}): SitePipelineRun {
  return {
    buildNumber: 30,
    status: 'success',
    refName: 'master',
    commitSha: 'a1b2c3d',
    trigger: 'PUSH',
    createdOn: 1_700_000_000_000,
    durationSeconds: 92,
    currentStep: null,
    completedSteps: null,
    totalSteps: null,
    url: 'https://bitbucket.org/efront_au/acme/pipelines/results/30',
    ...overrides
  }
}

/** Resolves to `production`, matching a site pointed at production with no branch match. */
function context(resolved = 'production'): SiteMcpContext {
  const record = site()
  return {
    store: { listSites: () => [record], getSite: () => record, findSiteByPath: () => record },
    cwd: '/Sites/acme',
    summarize: async (): Promise<SiteSummary> =>
      ({
        site: record,
        branch: 'master',
        resolvedEnvironment: {
          environment: resolved,
          reason: 'active-environment',
          requiresConfirmation: false
        }
      }) as unknown as SiteSummary
  } as unknown as SiteMcpContext
}

async function call(ctx: SiteMcpContext): Promise<Record<string, unknown>> {
  const tool = SITE_MCP_PIPELINE_TOOLS[0]
  const result = await dispatchSiteMcpTool(ctx, tool, {})
  return JSON.parse(result.content[0]?.text ?? '{}')
}

function available(runs: SitePipelineRun[]): SitePipelinesResult {
  return { available: true, runs, workspace: 'efront_au', repoSlug: 'acme' }
}

describe('get_site_pipelines', () => {
  it('reports a finished run as not in flight, with the live domain to check', async () => {
    getSitePipelinesMock.mockResolvedValue(available([run()]))

    const payload = await call(context())

    expect(payload.available).toBe(true)
    expect(payload.newest_in_flight).toBe(false)
    expect(payload.live_domain).toBe('acme.com.au')
    expect(payload.workspace).toBe('efront_au')
    expect(payload.current_branch).toBe('master')
    expect((payload.runs as Record<string, unknown>[])[0]).toMatchObject({
      build_number: 30,
      status: 'success',
      in_flight: false,
      commit: 'a1b2c3d',
      url: 'https://bitbucket.org/efront_au/acme/pipelines/results/30'
    })
  })

  it('flags a running pipeline as in flight and names the current step', async () => {
    getSitePipelinesMock.mockResolvedValue(
      available([
        run({
          status: 'running',
          currentStep: 'Deploy to production',
          completedSteps: 1,
          totalSteps: 3
        }),
        run({ buildNumber: 29 })
      ])
    )

    const payload = await call(context())

    expect(payload.newest_in_flight).toBe(true)
    expect((payload.runs as Record<string, unknown>[])[0]).toMatchObject({
      in_flight: true,
      current_step: 'Deploy to production',
      completed_steps: 1,
      total_steps: 3
    })
    // Older runs are still listed, but none of them is what the agent is waiting on.
    expect((payload.runs as Record<string, unknown>[])[1]).toMatchObject({ in_flight: false })
  })

  it('follows the resolved environment for the live domain, not the first one', async () => {
    getSitePipelinesMock.mockResolvedValue(available([run()]))

    const payload = await call(context('staging'))

    expect(payload.environment).toBe('staging')
    expect(payload.live_domain).toBe('staging.acme.com.au')
  })

  it.each([
    ['not-bitbucket', 'not a Bitbucket repository'],
    ['not-authenticated', 'ORCA_BITBUCKET_ACCESS_TOKEN'],
    ['forbidden', "'pipeline' read scope"],
    ['not-found', 'stale after a rename']
  ])('explains %s instead of failing', async (reason, fragment) => {
    getSitePipelinesMock.mockResolvedValue({ available: false, reason })

    const payload = await call(context())

    // ok stays true: an agent polling a non-Bitbucket site should stop, not retry an error.
    expect(payload.ok).toBe(true)
    expect(payload.available).toBe(false)
    expect(payload.reason).toBe(reason)
    expect(String(payload.detail)).toContain(fragment)
  })

  it('degrades an undecryptable credential to not-authenticated rather than erroring', async () => {
    // Real case: the keychain prompt was denied, so safeStorage cannot read the stored token. The
    // user has to act, so an agent should stop polling — not retry forever.
    getSitePipelinesMock.mockRejectedValue(
      new Error('Could not decrypt saved Bitbucket credential. Approve Keychain access.')
    )

    const payload = await call(context())

    expect(payload.ok).toBe(true)
    expect(payload.reason).toBe('not-authenticated')
  })

  it('still throws for a transient failure, so the agent retries', async () => {
    getSitePipelinesMock.mockRejectedValue(new Error('Bitbucket request failed: HTTP 503'))

    const payload = await call(context())

    expect(payload.ok).toBe(false)
    expect(String(payload.error)).toContain('503')
  })

  // Why: the tool used to pass site.path. A site whose repository lives under app/public with no
  // recorded WordPress subpath then reported not-bitbucket even though its remote was Bitbucket —
  // the exact failure seen on roads-australia.
  it('asks about the directory that holds .git, not the site root', async () => {
    const checkout = mkdtempSync(join(tmpdir(), 'muster-pipe-site-'))
    const wpRoot = join(checkout, 'app', 'public')
    mkdirSync(join(wpRoot, '.git'), { recursive: true })
    getSitePipelinesMock.mockResolvedValue(available([run()]))

    const record = { ...site(), path: checkout, localWpRoot: '' }
    const ctx = {
      store: { listSites: () => [record], getSite: () => record, findSiteByPath: () => record },
      cwd: checkout,
      summarize: async () =>
        ({
          site: record,
          branch: 'master',
          resolvedEnvironment: { environment: 'production', reason: 'active-environment' }
        }) as unknown as SiteSummary
    } as unknown as SiteMcpContext

    await call(ctx)

    expect(getSitePipelinesMock).toHaveBeenLastCalledWith(wpRoot)
    rmSync(checkout, { recursive: true, force: true })
  })

  it('handles a repository with no runs yet', async () => {
    getSitePipelinesMock.mockResolvedValue(available([]))

    const payload = await call(context())

    expect(payload.newest_in_flight).toBe(false)
    expect(payload.runs).toEqual([])
  })
})
