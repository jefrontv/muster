import { describe, expect, it, vi } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../../shared/site-types'
import type { SiteMcpContext } from './site-mcp-context'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

vi.mock('../../lib/stream-command', () => ({
  streamCommand: vi.fn(async () => ({
    code: 0,
    stdout: '6.5.2',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false
  }))
}))

function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
  return {
    ...createEmptySiteEnvironment(),
    hostname: 'acme.example.com',
    username: 'deploy',
    liveDomain: 'acme.com',
    deployThemes: true,
    ...overrides
  }
}

function siteRecord(): Site {
  return {
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
    environments: { main: environment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

function fakeContext(branch: string | null = 'main'): SiteMcpContext {
  const site = siteRecord()
  const summarize = async () => ({
    site,
    pathExists: true,
    branch,
    resolvedEnvironment: {
      environment: 'main',
      reason: branch === 'main' ? ('branch-match' as const) : ('active-environment' as const),
      requiresConfirmation: branch !== 'main'
    },
    secrets: { main: { ssh: true, db: true } },
    importSelectedCount: 0,
    deploySelectedCount: 1
  })
  return {
    cwd: '/Sites/acme',
    store: {
      listSites: () => [site],
      getSite: () => site,
      findSiteByPath: () => site,
      updateSite: () => site
    },
    annotatePlan: async () => ({ requestId: 'r1' }),
    collectPlanReview: async () => ({ status: 'unknown' as const }),
    updateSite: async () => site,
    summarize,
    summarizeAll: async (sites) => Promise.all(sites.map(() => summarize())),
    hasSshSecret: () => true,
    copyEnvironmentSecrets: () => undefined,
    deleteEnvironmentSecrets: () => undefined,
    gitStatus: async () => null,
    listRuns: () => [],
    readRunLog: () => ({ run: null, lines: [], truncatedEarlier: 0, firstErrorIndex: -1 }),
    listActiveRuns: () => [],
    startRun: () => {
      throw new Error('not used')
    },
    cancelRun: () => false,
    openSshSession: async () => ({
      exec: async (command: string) => {
        if (command.includes('bedrock-root')) {
          return { code: 0, stdout: 'standard\n', stderr: '' }
        }
        if (command.includes('wp-config.php')) {
          return { code: 0, stdout: 'yes\n', stderr: '' }
        }
        return { code: 0, stdout: '6.5.2', stderr: '' }
      },
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async () => undefined,
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }),
    shutdownRuns: async () => undefined
  }
}

async function call(name: string, args: Record<string, unknown>, branch?: string) {
  const tool = findSiteMcpTool(name)
  if (!tool) {
    throw new Error(`missing ${name}`)
  }
  const result = await dispatchSiteMcpTool(fakeContext(branch), tool, args)
  return { isError: result.isError === true, payload: JSON.parse(result.content[0]?.text ?? '{}') }
}

describe('run_wp_cli', () => {
  it('runs locally without SSH', async () => {
    const { isError, payload } = await call('run_wp_cli', { args: ['core', 'version'] })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({ ok: true, location: 'local', environment: null })
  })

  it('still refuses eval with writes allowed', async () => {
    const { payload } = await call('run_wp_cli', {
      args: ['eval', 'phpinfo'],
      allow_writes: true
    })
    expect(payload.blocked).toBe(true)
    expect(String(payload.safety_reason)).toContain('update_wp_fields')
  })
})

describe('run_remote_wp_cli', () => {
  it('blocks an unmatched branch without env or confirm', async () => {
    const { payload } = await call('run_remote_wp_cli', { args: ['core', 'version'] }, 'feature/x')
    expect(payload).toMatchObject({
      ok: false,
      blocked: true,
      blocked_by: ['unmatched-branch']
    })
  })

  it('runs when env is explicit', async () => {
    const { payload } = await call(
      'run_remote_wp_cli',
      { args: ['core', 'version'], env: 'main' },
      'feature/x'
    )
    expect(payload).toMatchObject({ ok: true, location: 'remote', environment: 'main' })
  })
})
