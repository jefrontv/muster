// The fake engine seam the site MCP tool tests drive: a Site store, a run service and the
// sentinel secrets every test asserts never leak. Test-only; nothing in the app imports it.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SiteActiveRun, SiteRun, SiteRunLogPage } from '../../../shared/site-run-types'
import {
  createEmptySiteEnvironment,
  resolveSiteEnvironment,
  type Site,
  type SiteEnvironment,
  type SiteCustomStep,
  type SiteSecretPresence,
  type SiteSummary
} from '../../../shared/site-types'
import { applyEnvironmentPatches } from '../site-environment-patches'
import { createAcfStateStore } from '../wp-acf-state-store'
import type { SiteMcpContext, SiteMcpStartRunRequest } from './site-mcp-context'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

// Sentinels. Nothing a tool returns may ever contain these, no matter which tool or which branch.
export const SSH_SECRET = 'ssh-pw-SENTINEL-must-never-leak'
export const DB_SECRET = 'db-pw-SENTINEL-must-never-leak'
export const RUN_ID = 'run-1'

export function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
  return {
    ...createEmptySiteEnvironment(),
    hostname: 'acme.example.com',
    username: 'deploy',
    liveDomain: 'acme.com',
    ...overrides
  }
}

/**
 * The rogue password properties are deliberate: an ocsites-imported record could carry them, and
 * any tool that spreads a raw Site into its response would leak them. Site has no such properties,
 * so this is the only way to prove the responses are built field by field.
 */
export function siteRecord(overrides: Partial<Site> = {}): Site {
  const base: Site = {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: {
      main: environment({ exportDatabase: true, deployThemes: true }),
      staging: environment({
        hostname: 'staging.acme.example.com',
        exportFiles: true
      })
    },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    customSteps: [
      {
        id: 'step-1',
        name: 'Warm the cache',
        group: 'deploy',
        runsOn: 'remote',
        command: 'curl -s https://acme.com > /dev/null',
        position: 'after',
        order: 0,
        // Disabled on purpose: the run-plan tests assert step counts, and an enabled custom step
        // would silently change every one of them.
        enabled: false
      }
    ],
    ...overrides
  }
  return Object.assign(base, { password: SSH_SECRET, db_password: DB_SECRET })
}

export const PERSISTED_RUN: SiteRun = {
  id: RUN_ID,
  siteId: 'site-1',
  siteName: 'Acme',
  group: 'deploy',
  environment: 'main',
  branch: 'main',
  status: 'succeeded',
  startedAt: 1_000,
  endedAt: 5_000,
  error: null,
  logPath: '/runs/site-1/run-1/output.log'
}

export type FakeContext = SiteMcpContext & {
  started: SiteMcpStartRunRequest[]
  cancelled: string[]
  secretMoves: string[]
}

export type FakeOptions = {
  branch?: string | null
  sshEnvironments?: string[]
  pathExists?: boolean
  activeRuns?: SiteActiveRun[]
}

export function createFakeContext(
  sites: Site[] = [siteRecord()],
  options: FakeOptions = {}
): FakeContext {
  const branch = options.branch === undefined ? 'main' : options.branch
  const sshEnvironments = options.sshEnvironments ?? ['main']
  const pathExists = options.pathExists ?? true
  const records = [...sites]
  const started: SiteMcpStartRunRequest[] = []
  const cancelled: string[] = []
  const secretMoves: string[] = []
  let library: SiteCustomStep[] = [
    {
      id: 'library-1',
      name: 'Purge Cloudflare',
      group: 'deploy',
      runsOn: 'local',
      command: 'echo purge',
      position: 'after',
      order: 0,
      enabled: false
    }
  ]

  const summarize = (site: Site): Promise<SiteSummary> => {
    const secrets: Record<string, SiteSecretPresence> = {}
    for (const name of Object.keys(site.environments)) {
      secrets[name] = {
        ssh: sshEnvironments.includes(name),
        db: sshEnvironments.includes(name)
      }
    }
    const resolvedEnvironment = resolveSiteEnvironment(site, branch)
    const active = resolvedEnvironment.environment
    const environmentRecord = active ? site.environments[active] : undefined
    return Promise.resolve({
      site,
      pathExists,
      branch,
      resolvedEnvironment,
      secrets,
      importSelectedCount: environmentRecord?.exportDatabase === true ? 1 : 0,
      deploySelectedCount: environmentRecord?.deployThemes === true ? 1 : 0
    })
  }

  const logPage: SiteRunLogPage = {
    run: PERSISTED_RUN,
    lines: [{ at: 1_100, level: 'info', text: 'connected to acme.example.com' }],
    truncatedEarlier: 0,
    firstErrorIndex: -1
  }

  return {
    cwd: '/Sites/acme/wp-content/themes/acme',
    // The census invokes every tool; a plan review resolves immediately so it never hangs a sweep.
    annotatePlan: () => Promise.resolve({ requestId: 'r1' }),
    collectPlanReview: () => Promise.resolve({ status: 'unknown' as const }),
    updateSite: async (siteId, updates, environmentPatches) => {
      const index = records.findIndex((site) => site.id === siteId)
      const existing = records[index]
      if (!existing) {
        return null
      }
      // Same merge the engine and the GUI bridge apply.
      const environments = environmentPatches
        ? applyEnvironmentPatches(existing.environments, environmentPatches)
        : existing.environments
      const next = { ...existing, ...updates, environments, id: siteId }
      records[index] = next
      return next
    },
    openSshSession: async () => ({
      exec: async (command: string) => {
        if (command.includes('bedrock-root')) {
          return { code: 0, stdout: 'standard\n', stderr: '' }
        }
        if (command.includes('wp-config.php') && command.includes('echo yes')) {
          return { code: 0, stdout: 'yes\n', stderr: '' }
        }
        if (command.includes('eval-file')) {
          return {
            code: 0,
            stdout:
              '{"ok":true,"home":"https://acme.com","acf_version":"6.3.0","warnings":[],"results":[]}',
            stderr: ''
          }
        }
        return { code: 0, stdout: 'remote-ok', stderr: '' }
      },
      // The walker writes its snapshot beside the payload; the real session downloads that file.
      download: async (_remotePath: string, localPath: string) => {
        writeFileSync(
          localPath,
          '{"ok":true,"target":{"kind":"option"},"roots":{"hero_title":"Old"},"digests":{"hero_title":"aaa"},"target_digest":"root"}',
          'utf8'
        )
      },
      upload: async () => undefined,
      writeSecureRemoteFile: async () => undefined,
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }),
    acfState,
    store: {
      listSites: () => records,
      getSite: (siteId) => records.find((site) => site.id === siteId) ?? null,
      findSiteByPath: (sitePath) => records.find((site) => site.path === sitePath) ?? null,
      updateSite: (siteId, updates) => {
        const index = records.findIndex((site) => site.id === siteId)
        const existing = records[index]
        if (!existing) {
          return null
        }
        const next = { ...existing, ...updates, id: siteId }
        records[index] = next
        return next
      }
    },
    getStepLibrary: () => library,
    setStepLibrary: async (steps) => {
      library = [...steps]
    },
    summarize,
    summarizeAll: (list) => Promise.all(list.map((site) => summarize(site))),
    hasSshSecret: (_siteId, name) => sshEnvironments.includes(name),
    copyEnvironmentSecrets: (_siteId, from, to) => {
      secretMoves.push(`copy:${from}->${to}`)
    },
    deleteEnvironmentSecrets: (_siteId, name) => {
      secretMoves.push(`delete:${name}`)
    },
    gitStatus: () =>
      Promise.resolve({
        branch: branch ?? 'HEAD',
        detached_head: false,
        remote_url: 'git@example.com:acme/acme.git',
        has_upstream: true,
        ahead: 1,
        behind: 0,
        last_commit: 'abc1234 fix things (2 hours ago by Dev)',
        dirty: false,
        dirty_file_count: 0
      }),
    listRuns: (siteId) => (siteId === 'site-1' ? [PERSISTED_RUN] : []),
    readRunLog: (siteId, runId) =>
      siteId === 'site-1' && runId === RUN_ID
        ? logPage
        : { run: null, lines: [], truncatedEarlier: 0, firstErrorIndex: -1 },
    listActiveRuns: () => options.activeRuns ?? [],
    startRun: (request) => {
      started.push(request)
      return {
        ...PERSISTED_RUN,
        id: 'run-2',
        group: request.group,
        environment: request.environment,
        branch: request.branch,
        status: 'running',
        endedAt: null
      }
    },
    cancelRun: (runId) => {
      cancelled.push(runId)
      return true
    },
    shutdownRuns: () => Promise.resolve(),
    started,
    cancelled,
    secretMoves
  }
}

export type CallOutcome = {
  isError: boolean
  payload: Record<string, unknown>
  text: string
}

export async function call(
  context: SiteMcpContext,
  name: string,
  args: Record<string, unknown> = {}
): Promise<CallOutcome> {
  const tool = findSiteMcpTool(name)
  if (!tool) {
    throw new Error(`tool ${name} is not registered`)
  }
  const result = await dispatchSiteMcpTool(context, tool, args)
  const text = result.content[0]?.text ?? ''
  return { isError: result.isError === true, payload: JSON.parse(text), text }
}

// A real store on a temp directory: the census drives every tool, and stubbing this one would stop
// it proving that the snapshot and revert tools work end to end.
export const acfState = createAcfStateStore(mkdtempSync(join(tmpdir(), 'muster-census-acf-')))
