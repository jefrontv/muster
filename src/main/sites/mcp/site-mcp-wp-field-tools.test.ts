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

function cannedRun(stdout: string): void {
  vi.mocked(streamCommand).mockResolvedValueOnce({
    code: 0,
    stdout,
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false
  })
}

describe('update_wp_fields envelope', () => {
  it('reports ok false when the atomic guard skipped a requested apply', async () => {
    cannedRun(
      '{"ok":false,"home":"https://acme.local","acf_version":"6.8.10","apply":false,"apply_skipped":true,"warnings":["nothing was applied"],"results":[{"path":"hero_titel","error":"unknown field"}]}'
    )
    const { isError, payload } = await call('update_wp_fields', {
      location: 'local',
      target: { kind: 'option' },
      fields: [{ path: 'hero_titel', value: 'Hi' }],
      apply: true
    })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({ ok: false, apply: false, apply_skipped: true })
  })

  it('passes the revert payload through unchanged', async () => {
    const revert = {
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Old' }]
    }
    cannedRun(
      JSON.stringify({
        ok: true,
        home: 'https://acme.local',
        acf_version: '6.8.10',
        apply: true,
        warnings: [],
        results: [{ path: 'hero_title', old: 'Old', new: 'Hi', changed: true, applied: true }],
        revert
      })
    )
    const { isError, payload } = await call('update_wp_fields', {
      location: 'local',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Hi' }],
      apply: true
    })
    expect(isError).toBe(false)
    expect(payload.revert).toEqual(revert)
  })
})

describe('wp_eval_file', () => {
  async function evalBody(php: string): Promise<string> {
    evalFiles.length = 0
    const { isError } = await call('wp_eval_file', { location: 'remote', env: 'main', php })
    expect(isError).toBe(false)
    return evalFiles.find((file) => file.path.endsWith('.php'))?.contents ?? ''
  }

  it('prepends the open tag so a tagless body runs instead of echoing itself', async () => {
    expect(await evalBody("echo 'hi';")).toBe("<?php\necho 'hi';")
  })

  it.each([['<?php echo 1;'], ['<?= 1 ?>'], ['  \n<?php echo 1;']])(
    'leaves %j untouched',
    async (php) => {
      expect(await evalBody(php)).toBe(php)
    }
  )

  it('drops a BOM ahead of the tag instead of echoing three stray bytes', async () => {
    expect(await evalBody('\uFEFF<?php echo 1;')).toBe('<?php echo 1;')
  })
})

describe('return projection', () => {
  it('drops the host bookkeeping and asks PHP for the short shape', async () => {
    evalFiles.length = 0
    const { isError, payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: ['hero_title'],
      return: 'values'
    })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({
      ok: true,
      site: 'Acme',
      location: 'remote',
      environment: 'main'
    })
    for (const key of ['site_id', 'host', 'wp_root', 'command']) {
      expect(payload).not.toHaveProperty(key)
    }
    expect(
      JSON.parse(evalFiles.find((file) => file.path.endsWith('.json'))?.contents ?? '{}')
    ).toMatchObject({ return: 'values' })
  })

  it('keeps the full envelope by default and sends no return key', async () => {
    evalFiles.length = 0
    const { payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: ['hero_title']
    })
    expect(payload).toHaveProperty('wp_root')
    expect(payload).toHaveProperty('command')
    expect(
      JSON.parse(evalFiles.find((file) => file.path.endsWith('.json'))?.contents ?? '{}')
    ).not.toHaveProperty('return')
  })

  it('refuses an unknown return mode', async () => {
    const { isError, payload } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Hi' }],
      return: 'brief'
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("'return'")
  })
})

describe('multi-target', () => {
  it('sends targets in place of target', async () => {
    evalFiles.length = 0
    const targets = [
      { kind: 'post', id: 1 },
      { kind: 'post', id: 2 }
    ]
    const { isError } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      targets,
      fields: [{ path: 'page_theme', value: 'blue' }]
    })
    expect(isError).toBe(false)
    expect(
      JSON.parse(evalFiles.find((file) => file.path.endsWith('.json'))?.contents ?? '{}')
    ).toMatchObject({ targets })
    expect(
      JSON.parse(evalFiles.find((file) => file.path.endsWith('.json'))?.contents ?? '{}')
    ).not.toHaveProperty('target')
  })

  it('refuses target and targets in one call', async () => {
    const { isError, payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      targets: [{ kind: 'post', id: 1 }],
      fields: ['hero_title']
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('not both')
  })

  it('refuses targets alongside location both', async () => {
    const { isError, payload } = await call('get_wp_fields', {
      location: 'both',
      env: 'main',
      targets: [{ kind: 'post', id: 1 }],
      fields: ['hero_title']
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("location 'both'")
  })
})

describe('location both', () => {
  it('reads each host once and merges them into one comparison', async () => {
    evalFiles.length = 0
    cannedRun(
      JSON.stringify({
        ok: true,
        home: 'https://acme.local',
        acf_version: '6.8.10',
        warnings: [],
        results: [{ path: 'page_theme', exists: true, value: 'red' }]
      })
    )
    const { isError, payload } = await call('get_wp_fields', {
      location: 'both',
      env: 'main',
      target: { kind: 'post', id: 672 },
      fields: ['page_theme']
    })
    expect(isError).toBe(false)
    expect(payload).toMatchObject({ location: 'both', differs_count: 1, environment: 'main' })
    expect(payload.local).toMatchObject({ home: 'https://acme.local' })
    expect(payload.remote).toMatchObject({ home: 'https://acme.com' })
    expect(payload.results[0]).toMatchObject({
      path: 'page_theme',
      local: 'red',
      remote: null,
      differs: true
    })
    expect(
      JSON.parse(evalFiles.find((file) => file.path.endsWith('.json'))?.contents ?? '{}')
    ).toMatchObject({ mode: 'get', fields: [{ path: 'page_theme' }] })
  })

  it('keeps update_wp_fields on one host', async () => {
    const { isError, payload } = await call('update_wp_fields', {
      location: 'both',
      env: 'main',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title', value: 'Hi' }]
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("'local' or 'remote'")
  })
})

describe('oversize responses', () => {
  it('tells the agent the output was cut instead of blaming the JSON', async () => {
    vi.mocked(streamCommand).mockResolvedValueOnce({
      code: 0,
      stdout: `{"ok":true,"results":[${'x'.repeat(1_000_050)}`,
      stderr: '',
      timedOut: false,
      truncated: false,
      stoppedEarly: false
    })
    const { isError, payload } = await call('get_wp_fields', {
      location: 'local',
      target: { kind: 'post', id: 672 },
      fields: ['modules.*.acf_fc_layout']
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('cut at 1000000 characters')
    expect(String(payload.error)).toContain('layout_filter')
  })
})

describe('update_wp_fields rows', () => {
  it('sends the row operations to the runner alongside fields', async () => {
    evalFiles.length = 0
    const rows = [
      { op: 'append', path: 'modules', layout: 'media', values: { section_id: 'hero' } },
      { op: 'move', path: 'modules', index: 7, to: 2 }
    ]
    const { isError } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'post', id: 672 },
      fields: [{ path: 'page_theme', value: 'blue' }],
      rows
    })
    expect(isError).toBe(false)
    const sidecar = evalFiles.find((file) => file.path.endsWith('.json'))
    expect(JSON.parse(sidecar?.contents ?? '{}')).toMatchObject({
      mode: 'preview',
      fields: [{ path: 'page_theme', value: 'blue' }],
      rows
    })
  })

  it('accepts rows on their own', async () => {
    evalFiles.length = 0
    const { isError } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'post', id: 672 },
      rows: [{ op: 'delete', path: 'modules', index: 7 }],
      apply: true
    })
    expect(isError).toBe(false)
    const sidecar = evalFiles.find((file) => file.path.endsWith('.json'))
    expect(JSON.parse(sidecar?.contents ?? '{}')).toMatchObject({ mode: 'apply', fields: [] })
  })

  it('refuses a call that changes nothing', async () => {
    const { isError, payload } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'post', id: 672 }
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("'fields' or 'rows'")
  })

  it('reports a bad operation before opening SSH', async () => {
    evalFiles.length = 0
    const { isError, payload } = await call('update_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'post', id: 672 },
      rows: [{ op: 'move', path: 'modules', index: 7 }],
      apply: true
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("'rows[0].to' is required by move.")
    expect(evalFiles).toHaveLength(0)
  })
})

describe('get_wp_fields describe mode', () => {
  it('sends mode describe, the paths and layout_filter to the runner', async () => {
    evalFiles.length = 0
    const { isError } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'post', id: 672 },
      fields: ['modules'],
      describe: true,
      layout_filter: 'media'
    })
    expect(isError).toBe(false)
    const sidecar = evalFiles.find((file) => file.path.endsWith('.json'))
    expect(JSON.parse(sidecar?.contents ?? '{}')).toMatchObject({
      mode: 'describe',
      layout_filter: 'media',
      fields: [{ path: 'modules' }]
    })
  })

  it('returns a describe envelope unchanged', async () => {
    const results = [
      {
        path: 'modules',
        field: { name: 'modules', key: 'field_a', type: 'flexible_content', label: 'Modules' },
        rows: 3,
        layouts: [
          { name: 'media', label: 'Media', sub_fields: [{ name: 'section_id', type: 'text' }] }
        ],
        row_layouts: [
          { index: 0, layout: 'media' },
          { index: 1, layout: 'text' },
          { index: 2, layout: 'media' }
        ],
        where: { layout: 'media', indexes: [0, 2] }
      }
    ]
    cannedRun(
      JSON.stringify({
        ok: true,
        home: 'https://acme.local',
        acf_version: '6.8.10',
        warnings: [],
        results
      })
    )
    const { isError, payload } = await call('get_wp_fields', {
      location: 'local',
      target: { kind: 'post', id: 672 },
      describe: true
    })
    expect(isError).toBe(false)
    expect(payload.results).toEqual(results)
  })

  it('describes the whole target when fields is omitted', async () => {
    evalFiles.length = 0
    const { isError } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      describe: true
    })
    expect(isError).toBe(false)
    const sidecar = evalFiles.find((file) => file.path.endsWith('.json'))
    expect(JSON.parse(sidecar?.contents ?? '{}')).toMatchObject({ mode: 'describe', fields: [] })
  })

  it('refuses layout_filter without describe', async () => {
    const { isError, payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' },
      fields: ['modules'],
      layout_filter: 'media'
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain('describe')
  })

  it('still requires fields when describe is false', async () => {
    const { isError, payload } = await call('get_wp_fields', {
      location: 'remote',
      env: 'main',
      target: { kind: 'option' }
    })
    expect(isError).toBe(true)
    expect(String(payload.error)).toContain("'fields'")
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
