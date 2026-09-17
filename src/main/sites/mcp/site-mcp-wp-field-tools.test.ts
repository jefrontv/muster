import { describe, expect, it, vi } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../../shared/site-types'
import { streamCommand } from '../../lib/stream-command'
import type { SiteMcpContext } from './site-mcp-context'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

const evalFiles: { path: string; contents: string }[] = []

vi.mock('../../lib/stream-command', () => ({
  streamCommand: vi.fn(async () => ({
    code: 0,
    stdout:
      '{"ok":true,"home":"https://acme.local","acf_version":"6.3.0","warnings":[],"results":[]}',
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
    environments: {
      main: environment(),
      local: environment({ hostname: 'local-env.example.com' })
    },
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
    secrets: { main: { ssh: true, db: true }, local: { ssh: true, db: true } },
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
        if (command.includes('eval-file')) {
          return {
            code: 0,
            stdout:
              '{"ok":true,"home":"https://acme.com","acf_version":"6.3.0","warnings":[],"results":[]}',
            stderr: ''
          }
        }
        return { code: 0, stdout: 'ok', stderr: '' }
      },
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async (path, contents) => {
        evalFiles.push({ path, contents })
      },
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

describe('update_wp_fields', () => {
  it('defaults apply to false and still returns home/location', async () => {
    evalFiles.length = 0
    const { isError, payload } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Hi' }]
    })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({
      ok: true,
      location: 'remote',
      environment: 'main',
      home: 'https://acme.com'
    })
    const sidecar = evalFiles.find((file) => file.path.endsWith('.json'))
    expect(sidecar?.contents).toContain('"mode":"preview"')
  })

  it('requires location', async () => {
    const { isError, payload } = await call('update_wp_fields', {
      env: 'main',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Hi' }]
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('location')
  })

  it('treats env=local as an environment name, not the checkout', async () => {
    const { payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'local',
      target: { kind: 'option' },
      fields: ['hero_title']
    })
    expect(payload.environment).toBe('local')
    expect(payload.location).toBe('remote')
  })
})

describe('get_wp_fields', () => {
  it('blocks remote reads off an unmatched branch', async () => {
    const { payload } = await call(
      'get_wp_fields',
      { location: 'remote', target: { kind: 'option' }, fields: ['hero_title'] },
      'feature/x'
    )
    expect(payload).toMatchObject({ blocked: true, blocked_by: ['unmatched-branch'] })
  })

  it('explains a local WP root that wp cannot boot', async () => {
    vi.mocked(streamCommand).mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr:
        'Error: This does not seem to be a WordPress installation.\nPass --path=`path/to/wordpress` or run `wp core download`.',
      timedOut: false,
      truncated: false,
      stoppedEarly: false
    })
    const { isError, payload } = await call('get_wp_fields', {
      location: 'local',
      target: { kind: 'option' },
      fields: ['hero_title']
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("location='remote'")
    expect(payload.exit_code).toBe(1)
  })
})
