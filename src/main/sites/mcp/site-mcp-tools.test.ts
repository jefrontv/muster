import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import type { SiteActiveRun, SiteRun, SiteRunLogPage } from '../../../shared/site-run-types'
import {
  createEmptySiteEnvironment,
  CUSTOM_STEP_SCRIPT_DIR,
  resolveSiteEnvironment,
  type Site,
  type SiteEnvironment,
  type SiteCustomStep,
  type SiteSecretPresence,
  type SiteSummary
} from '../../../shared/site-types'
import type { SiteMcpContext, SiteMcpStartRunRequest } from './site-mcp-context'
import { dispatchSiteMcpTool, findSiteMcpTool, SITE_MCP_TOOLS } from './site-mcp-tools'

// Sentinels. Nothing a tool returns may ever contain these, no matter which tool or which branch.
const SSH_SECRET = 'ssh-pw-SENTINEL-must-never-leak'
const DB_SECRET = 'db-pw-SENTINEL-must-never-leak'
const RUN_ID = 'run-1'

function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
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
function siteRecord(overrides: Partial<Site> = {}): Site {
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

const PERSISTED_RUN: SiteRun = {
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

type FakeContext = SiteMcpContext & {
  started: SiteMcpStartRunRequest[]
  cancelled: string[]
  secretMoves: string[]
}

type FakeOptions = {
  branch?: string | null
  sshEnvironments?: string[]
  pathExists?: boolean
  activeRuns?: SiteActiveRun[]
}

function createFakeContext(sites: Site[] = [siteRecord()], options: FakeOptions = {}): FakeContext {
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
    updateSite: async (siteId, updates) => {
      const index = records.findIndex((site) => site.id === siteId)
      const existing = records[index]
      if (!existing) {
        return null
      }
      const next = { ...existing, ...updates, id: siteId }
      records[index] = next
      return next
    },
    openSshSession: async () => ({
      exec: async () => ({ code: 0, stdout: 'remote-ok', stderr: '' }),
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async () => undefined,
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }),
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
    copyEnvironmentSecrets: (_siteId, from, to) => secretMoves.push(`copy:${from}->${to}`),
    deleteEnvironmentSecrets: (_siteId, name) => secretMoves.push(`delete:${name}`),
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

type CallOutcome = {
  isError: boolean
  payload: Record<string, unknown>
  text: string
}

async function call(
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

/** Every tool, with arguments that exercise its happy path against the fixture. */
const TOOL_ARGUMENTS: Record<string, Record<string, unknown>> = {
  list_sites: {},
  find_sites: { hostname: 'acme' },
  workspace_overview: {},
  get_git_status: {},
  get_deployment_status: {},
  get_deployment_config: {},
  list_deployment_toggles: {},
  set_deployment_toggles: { toggles: { export_database: false } },
  set_deployment_fields: {
    fields: { hostname: 'new.example.com', notes: 'touched' }
  },
  list_environments: {},
  create_environment: { name: 'qa', copy_from: 'main' },
  duplicate_environment: { source: 'main', new_name: 'qa2' },
  rename_environment: { old_name: 'staging', new_name: 'stage' },
  delete_environment: { name: 'staging', confirm: true },
  get_resolved_environment: {},
  which_env_for_branch: { branch_name: 'staging' },
  preview_run: { group: 'deploy' },
  run_import_functions: { env: 'main' },
  run_deploy_functions: { env: 'main' },
  run_ssh_command: { command: 'true', env: 'main' },
  list_recent_runs: {},
  get_run_log: { run_id: RUN_ID },
  list_jobs: {},
  get_job_status: { job_id: RUN_ID },
  cancel_job: { job_id: RUN_ID },
  list_custom_steps: {},
  create_custom_step: {
    name: 'Purge CDN',
    command: 'echo purge',
    group: 'deploy',
    runs_on: 'local'
  },
  update_custom_step: { step: 'step-1', name: 'Warm the cache again' },
  remove_custom_step: { step: 'step-1' },
  copy_custom_step: { from_site: 'Acme', step: 'step-1' },
  promote_custom_step: { step: 'step-1' },
  install_library_step: { library_step: 'library-1' },
  remove_library_step: { library_step: 'library-1' }
}

describe('site MCP tool table', () => {
  it('exposes every ocsites tool name exactly once', () => {
    const names = SITE_MCP_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.sort()).toEqual(Object.keys(TOOL_ARGUMENTS).sort())
  })

  it('advertises a closed object schema with a description for every tool', () => {
    for (const tool of SITE_MCP_TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20)
      expect(tool.inputSchema.type, tool.name).toBe('object')
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false)
      expect(Array.isArray(tool.inputSchema.required), tool.name).toBe(true)
      for (const required of tool.inputSchema.required) {
        expect(Object.keys(tool.inputSchema.properties), tool.name).toContain(required)
      }
      for (const property of Object.values(tool.inputSchema.properties)) {
        expect(typeof (property as { type?: unknown }).type, tool.name).toBe('string')
      }
    }
  })
})

describe('read tools against a fake store', () => {
  it('round-trips a site through list_sites', async () => {
    const { payload } = await call(createFakeContext(), 'list_sites', {})
    expect(payload).toMatchObject({
      ok: true,
      count: 1,
      sites: [
        {
          name: 'Acme',
          path: '/Sites/acme',
          branch: 'main',
          resolved_environment: 'main',
          environments: ['main', 'staging']
        }
      ]
    })
  })

  it('tells an agent where to write a step script, and flags one that is not there', async () => {
    const context = createFakeContext()
    const { payload: listed } = await call(context, 'list_custom_steps')
    // Answered here so an agent never has to guess the directory or call list_sites first.
    expect(listed.script_dir).toBe(join('/Sites/acme', CUSTOM_STEP_SCRIPT_DIR))

    const { payload: created } = await call(context, 'create_custom_step', {
      name: 'Purge CDN',
      script_path: `${CUSTOM_STEP_SCRIPT_DIR}/purge.sh`,
      group: 'deploy',
      runs_on: 'remote'
    })

    // The fixture site has no checkout on disk, which is exactly the mistake worth catching now
    // rather than partway through a deploy.
    expect(created.created).toMatchObject({
      script_path: `${CUSTOM_STEP_SCRIPT_DIR}/purge.sh`,
      script_exists: false,
      script_missing_create_file_at: join('/Sites/acme', CUSTOM_STEP_SCRIPT_DIR, 'purge.sh')
    })
  })

  it('resolves an omitted site from the working directory', async () => {
    const { payload } = await call(createFakeContext(), 'get_deployment_status', {})
    expect(payload).toMatchObject({
      ok: true,
      site: 'Acme',
      path: '/Sites/acme'
    })
  })

  it('reports a missing site rather than throwing', async () => {
    const outcome = await call(createFakeContext(), 'get_deployment_status', {
      site: 'nope'
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.payload).toMatchObject({ ok: false })
    expect(String(outcome.payload.error)).toContain('nope')
  })

  it('reports password presence as booleans only', async () => {
    const { payload } = await call(createFakeContext(), 'get_deployment_config', {})
    expect(payload.passwords_set).toEqual({
      password: true,
      db_password: true
    })
    expect(payload.fields).toMatchObject({
      hostname: 'acme.example.com',
      db_user: 'root'
    })
    expect(payload.fields).not.toHaveProperty('password')
    expect(payload.fields).not.toHaveProperty('db_password')
  })
})

describe('password redaction', () => {
  it('never returns a password value from any tool, on success or failure', async () => {
    for (const [name, args] of Object.entries(TOOL_ARGUMENTS)) {
      const outcome = await call(createFakeContext(), name, args)
      expect(outcome.text, `${name} leaked a secret`).not.toContain(SSH_SECRET)
      expect(outcome.text, `${name} leaked a secret`).not.toContain(DB_SECRET)
      expect(outcome.isError, `${name} failed: ${outcome.text}`).toBe(false)
    }
  })

  it('keeps secrets out of responses when the branch matches nothing', async () => {
    const context = createFakeContext([siteRecord()], {
      branch: 'feature/login'
    })
    for (const [name, args] of Object.entries(TOOL_ARGUMENTS)) {
      const outcome = await call(context, name, args)
      expect(outcome.text, `${name} leaked a secret`).not.toContain(SSH_SECRET)
      expect(outcome.text, `${name} leaked a secret`).not.toContain(DB_SECRET)
    }
  })

  it('refuses to set a password field instead of silently ignoring it', async () => {
    const outcome = await call(createFakeContext(), 'set_deployment_fields', {
      fields: { password: 'letmein', hostname: 'x.example.com' }
    })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain('Refusing to set password fields')
    expect(outcome.payload.refused_keys).toEqual(['password'])
  })

  it('does not apply any field when one key is refused', async () => {
    const context = createFakeContext()
    await call(context, 'set_deployment_fields', {
      fields: { db_password: 'letmein', notes: 'should not be written' }
    })
    expect(context.store.getSite('site-1')?.notes).toBe('')
  })
})

describe('the accidental-production guard', () => {
  const unmatchedBranch = { branch: 'feature/login' }

  it('refuses a deploy off an unmatched branch and returns the preview', async () => {
    const context = createFakeContext([siteRecord()], unmatchedBranch)
    const { payload } = await call(context, 'run_deploy_functions', {})
    expect(payload).toMatchObject({
      ok: false,
      blocked: true,
      needs_confirmation: true,
      resolved_environment: 'main',
      blocked_by: ['unmatched-branch'],
      preview: {
        group: 'deploy',
        environment: 'main',
        remote_target: 'deploy@acme.example.com:public_html',
        steps: [
          { key: 'git_pull_on_server', enabled: false },
          { key: 'clear_server_cache' },
          { key: 'deploy_themes', enabled: true }
        ]
      }
    })
    expect(context.started).toHaveLength(0)
  })

  it('starts the run when confirm overrides the unmatched branch', async () => {
    const context = createFakeContext([siteRecord()], unmatchedBranch)
    const { payload } = await call(context, 'run_deploy_functions', {
      confirm: true
    })
    expect(payload).toMatchObject({
      ok: true,
      started: true,
      environment: 'main'
    })
    expect(context.started).toEqual([
      {
        siteId: 'site-1',
        siteName: 'Acme',
        group: 'deploy',
        environment: 'main',
        branch: 'feature/login'
      }
    ])
  })

  it('accepts an explicit env without confirm, because that is a deliberate choice', async () => {
    const context = createFakeContext([siteRecord()], unmatchedBranch)
    const { payload } = await call(context, 'run_import_functions', {
      env: 'main'
    })
    expect(payload).toMatchObject({
      ok: true,
      started: true,
      environment: 'main'
    })
  })

  it('confirm cannot override a missing SSH credential', async () => {
    const context = createFakeContext([siteRecord()], {
      ...unmatchedBranch,
      sshEnvironments: []
    })
    const { payload } = await call(context, 'run_deploy_functions', {
      confirm: true
    })
    expect(payload).toMatchObject({
      ok: false,
      blocked: true,
      needs_confirmation: false
    })
    expect(payload.blocked_by).toContain('missing-ssh-credentials')
    expect(String(payload.message)).toContain('cannot be set over MCP')
    expect(context.started).toHaveLength(0)
  })

  it('confirm cannot override a missing checkout', async () => {
    const context = createFakeContext([siteRecord()], { pathExists: false })
    const { payload } = await call(context, 'run_import_functions', {
      confirm: true
    })
    expect(payload.blocked_by).toContain('missing-path')
    expect(context.started).toHaveLength(0)
  })

  it('confirm cannot override an empty step list', async () => {
    const site = siteRecord({ environments: { main: environment() } })
    const context = createFakeContext([site], { branch: 'main' })
    const { payload } = await call(context, 'run_deploy_functions', {
      confirm: true
    })
    expect(payload.blocked_by).toEqual(['no-steps-selected'])
    expect(context.started).toHaveLength(0)
  })

  it('rejects an env that does not exist rather than falling back', async () => {
    const context = createFakeContext()
    const outcome = await call(context, 'run_deploy_functions', {
      env: 'production'
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.payload.available_environments).toEqual(['main', 'staging'])
    expect(context.started).toHaveLength(0)
  })

  it("treats the string 'false' as a refusal, not as truthy confirmation", async () => {
    const context = createFakeContext([siteRecord()], unmatchedBranch)
    const { payload } = await call(context, 'run_deploy_functions', {
      confirm: 'false'
    })
    expect(payload.blocked).toBe(true)
    expect(context.started).toHaveLength(0)
  })
})

describe('config writes', () => {
  it('applies a toggle by its ocsites snake_case key', async () => {
    const context = createFakeContext()
    const { payload } = await call(context, 'set_deployment_toggles', {
      toggles: { clear_server_cache: true }
    })
    expect(payload.deploy_toggles).toMatchObject({ clear_server_cache: true })
    expect(context.store.getSite('site-1')?.environments.main?.clearServerCache).toBe(true)
  })

  it('accepts the camelCase alias for the same toggle', async () => {
    const context = createFakeContext()
    await call(context, 'set_deployment_toggles', {
      toggles: { clearServerCache: true }
    })
    expect(context.store.getSite('site-1')?.environments.main?.clearServerCache).toBe(true)
  })

  it('writes to the explicitly requested environment, not the resolved one', async () => {
    const context = createFakeContext()
    const { payload } = await call(context, 'set_deployment_toggles', {
      env: 'staging',
      toggles: { deploy_themes: true }
    })
    expect(payload.environment).toBe('staging')
    expect(context.store.getSite('site-1')?.environments.staging?.deployThemes).toBe(true)
    expect(context.store.getSite('site-1')?.environments.main?.deployThemes).toBe(true)
  })

  it('rejects an unknown toggle without saving anything', async () => {
    const context = createFakeContext()
    const outcome = await call(context, 'set_deployment_toggles', {
      toggles: { clear_server_cache: true, teleport: true }
    })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain('teleport')
    expect(context.store.getSite('site-1')?.environments.main?.clearServerCache).toBe(false)
  })

  it('routes site-level and environment-level fields to the right record', async () => {
    const context = createFakeContext()
    await call(context, 'set_deployment_fields', {
      fields: { local_domain: 'acme.test', root_path: 'www' }
    })
    const site = context.store.getSite('site-1')
    expect(site?.localDomain).toBe('acme.test')
    expect(site?.environments.main?.rootPath).toBe('www')
  })
})

describe('environment CRUD', () => {
  it('carries stored secrets across a rename and drops the old ones', async () => {
    const context = createFakeContext()
    const { payload } = await call(context, 'rename_environment', {
      old_name: 'staging',
      new_name: 'stage'
    })
    expect(payload.renamed).toEqual({ from: 'staging', to: 'stage' })
    expect(context.secretMoves).toEqual(['copy:staging->stage', 'delete:staging'])
    expect(Object.keys(context.store.getSite('site-1')?.environments ?? {})).toEqual([
      'main',
      'stage'
    ])
  })

  it('seeds a duplicate from its source, including the stored secrets', async () => {
    const context = createFakeContext()
    await call(context, 'duplicate_environment', {
      source: 'main',
      new_name: 'qa'
    })
    const site = context.store.getSite('site-1')
    expect(site?.environments.qa?.hostname).toBe('acme.example.com')
    expect(context.secretMoves).toEqual(['copy:main->qa'])
  })

  it('refuses to delete an environment without confirm and shows what would go', async () => {
    const context = createFakeContext()
    const { payload } = await call(context, 'delete_environment', {
      name: 'staging'
    })
    expect(payload).toMatchObject({
      ok: false,
      blocked: true,
      needs_confirmation: true
    })
    expect(payload.would_delete).toMatchObject({
      name: 'staging',
      ssh_password_set: false
    })
    expect(context.store.getSite('site-1')?.environments.staging).toBeDefined()
  })

  it('refuses to delete the last environment even with confirm', async () => {
    const context = createFakeContext([siteRecord({ environments: { main: environment() } })])
    const outcome = await call(context, 'delete_environment', {
      name: 'main',
      confirm: true
    })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain('only environment')
  })

  it('predicts a branch resolution without touching the checkout', async () => {
    const { payload } = await call(createFakeContext(), 'which_env_for_branch', {
      branch_name: 'staging'
    })
    expect(payload).toMatchObject({
      resolved_environment: 'staging',
      requires_confirmation: false
    })
    expect(String(payload.resolution_reason)).toContain('matches env name')
  })
})

describe('jobs and run history', () => {
  it('locates a persisted run by id without being told its site', async () => {
    const { payload } = await call(createFakeContext(), 'get_job_status', {
      job_id: RUN_ID
    })
    expect(payload).toMatchObject({
      ok: true,
      job_id: RUN_ID,
      status: 'succeeded',
      live: false
    })
    expect(payload.duration_seconds).toBe(4)
  })

  it('reports an unknown job instead of throwing', async () => {
    const outcome = await call(createFakeContext(), 'get_job_status', {
      job_id: 'missing'
    })
    expect(outcome.payload).toEqual({
      ok: false,
      error: 'Job not found: missing'
    })
  })

  it('refuses to cancel a run owned by another process', async () => {
    const context = createFakeContext([
      siteRecord({
        environments: { main: environment({ deployThemes: true }) }
      })
    ])
    const foreign: SiteRun = {
      ...PERSISTED_RUN,
      status: 'running',
      endedAt: null
    }
    const outcome = await call(
      {
        ...context,
        readRunLog: () => ({
          run: foreign,
          lines: [],
          truncatedEarlier: 0,
          firstErrorIndex: -1
        })
      },
      'cancel_job',
      { job_id: RUN_ID }
    )
    expect(outcome.payload.ok).toBe(false)
    expect(String(outcome.payload.error)).toContain('another Muster process')
    expect(context.cancelled).toHaveLength(0)
  })

  it('cancels a live run through the run service', async () => {
    const live: SiteActiveRun = {
      run: { ...PERSISTED_RUN, status: 'running', endedAt: null },
      progress: null
    }
    const context = createFakeContext([siteRecord()], { activeRuns: [live] })
    const { payload } = await call(context, 'cancel_job', { job_id: RUN_ID })
    expect(payload).toMatchObject({ ok: true, status: 'cancelling' })
    expect(context.cancelled).toEqual([RUN_ID])
  })
})
