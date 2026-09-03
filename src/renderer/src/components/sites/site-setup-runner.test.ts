// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import type { SiteSetupChoices, SiteSetupSource } from './site-setup-choices'
import { allImportToggles } from './site-setup-choices'
import { createSiteSetupRunner, type SiteSetupRunnerApi } from './site-setup-runner'

vi.mock('./last-local-stack-choice', () => ({ rememberLocalStackChoice: vi.fn() }))

const REPO_SOURCE: SiteSetupSource = {
  kind: 'repo',
  destinationRoot: '/Sites',
  repo: {
    provider: 'bitbucket',
    fullName: 'efront_au/flex',
    cloneUrl: 'git@bitbucket.org:efront_au/flex.git',
    description: '',
    updatedAt: null,
    isPrivate: true
  }
}

function choices(overrides: Partial<SiteSetupChoices> = {}): SiteSetupChoices {
  return {
    serve: { enabled: true, stack: 'localwp', domain: 'flex.local' },
    https: true,
    import: {
      enabled: true,
      environment: 'main',
      toggles: allImportToggles(),
      confirmMismatch: false
    },
    ...overrides
  }
}

function plan(overrides: Partial<SiteSetupPlan['stack']> = {}, importReady = true): SiteSetupPlan {
  return {
    siteId: 'site-1',
    stages: [],
    clone: { connectorConfigured: true, targets: [], error: '' },
    stack: {
      supported: true,
      alreadyLocalWp: false,
      alternatives: [],
      hasWordPress: false,
      stack: 'plain',
      suggestedDomain: 'flex.local',
      reason: '',
      ...overrides
    },
    import: {
      ready: importReady,
      blockedBy: importReady ? [] : ['no-ssh-password'],
      confirmable: false,
      environment: 'main',
      enabledStepCount: 4
    }
  } as unknown as SiteSetupPlan
}

type Calls = string[]

function fakeApi(options: {
  plan?: SiteSetupPlan
  migrationOk?: boolean
  calls: Calls
  runEvents?: { emit: (event: unknown) => void }
}): SiteSetupRunnerApi {
  let runListener: ((event: unknown) => void) | null = null
  if (options.runEvents) {
    options.runEvents.emit = (event) => runListener?.(event)
  }
  const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })
  return {
    repos: {
      clone: vi.fn(async (args: { url: string; destination: string }) => {
        options.calls.push(`clone ${args.destination}`)
        return { id: 'repo-1', path: `${args.destination}/flex` }
      }),
      cloneAbort: vi.fn(async () => {
        options.calls.push('cloneAbort')
      }),
      onCloneProgress: vi.fn(() => () => {}),
      onCloneLog: vi.fn(() => () => {})
    },
    sites: {
      create: vi.fn(async () => {
        options.calls.push('sites.create')
        return ok({ site: { id: 'site-1' } })
      }),
      upsertEnvironment: vi.fn(async () => {
        options.calls.push('upsertEnvironment')
        return ok({})
      })
    },
    siteBind: { confirm: vi.fn() },
    siteSetup: {
      plan: vi.fn(async () => {
        options.calls.push('plan')
        return ok(options.plan ?? plan())
      })
    },
    siteStacks: {
      onMigrationProgress: vi.fn(() => () => {}),
      setDomain: vi.fn(),
      previewMigration: vi.fn(async () => {
        options.calls.push('previewMigration')
        return ok({ ok: true, blockedReason: '', mode: 'create', moves: [], appPublicEntries: [] })
      }),
      runMigration: vi.fn(async () => {
        options.calls.push('runMigration')
        return options.migrationOk === false
          ? ok({
              ok: false,
              message: 'Domain flex.local is already taken',
              plan: { mode: 'create' }
            })
          : ok({ ok: true, message: 'ready', plan: { mode: 'create' } })
      })
    },
    localwpCert: {
      status: vi.fn(async () => {
        options.calls.push('cert.status')
        return ok({ supported: true, exists: false, trusted: true, reason: '', certPath: '' })
      }),
      trust: vi.fn(),
      ensure: vi.fn()
    },
    siteRuns: {
      onEvent: vi.fn((listener: (event: unknown) => void) => {
        runListener = listener
        return () => {
          runListener = null
        }
      }),
      start: vi.fn(async () => {
        options.calls.push('siteRuns.start')
        return ok({ id: 'run-1', status: 'running' })
      }),
      cancel: vi.fn(async (runId: string) => {
        options.calls.push(`siteRuns.cancel ${runId}`)
        return ok(true)
      })
    }
  } as unknown as SiteSetupRunnerApi
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSiteSetupRunner', () => {
  let calls: Calls
  beforeEach(() => {
    calls = []
  })

  it('runs clone, register, plan, serve, https, import in order and finishes done', async () => {
    const events = { emit: (_event: unknown) => {} }
    const api = fakeApi({ calls, runEvents: events })
    const runner = createSiteSetupRunner(api)
    const running = runner.start(REPO_SOURCE, choices())
    // Let the sequence reach the import, then settle its run.
    for (let i = 0; i < 20 && !calls.includes('siteRuns.start'); i += 1) {
      await flush()
    }
    events.emit({ type: 'log', runId: 'run-1', line: { text: 'pulling db' } })
    events.emit({ type: 'status', runId: 'run-1', status: 'succeeded' })
    await running

    expect(calls).toEqual([
      'clone /Sites',
      'sites.create',
      'plan',
      'previewMigration',
      'runMigration',
      'cert.status',
      'upsertEnvironment',
      'siteRuns.start'
    ])
    const snapshot = runner.snapshot()
    expect(snapshot.phase).toBe('done')
    expect(snapshot.siteId).toBe('site-1')
    expect(snapshot.createdLocalWp).toBe(true)
    expect(snapshot.domain).toBe('flex.local')
    expect(snapshot.steps.map((step) => `${step.id}:${step.state}`)).toEqual([
      'clone:done',
      'register:done',
      'serve:done',
      'https:done',
      'import:done'
    ])
    expect(snapshot.steps.find((step) => step.id === 'import')?.log).toEqual(['pulling db'])
  })

  it('records a stage the fresh plan rules out as skipped, without attempting it', async () => {
    const api = fakeApi({
      calls,
      plan: plan({ supported: false, reason: 'LocalWP only runs on macOS.' }, false)
    })
    const runner = createSiteSetupRunner(api)
    await runner.start(REPO_SOURCE, choices())

    const steps = runner.snapshot().steps
    expect(steps.find((step) => step.id === 'serve')).toMatchObject({
      state: 'skipped',
      detail: 'LocalWP only runs on macOS.'
    })
    expect(steps.find((step) => step.id === 'https')?.state).toBe('skipped')
    expect(steps.find((step) => step.id === 'import')).toMatchObject({
      state: 'skipped',
      detail: 'no-ssh-password'
    })
    expect(calls).not.toContain('runMigration')
    expect(calls).not.toContain('siteRuns.start')
    expect(runner.snapshot().phase).toBe('done')
  })

  it('stops at a failed serve, marks later steps not-run, and retries from serve keeping done steps', async () => {
    const api = fakeApi({ calls, migrationOk: false })
    const runner = createSiteSetupRunner(api)
    await runner.start(REPO_SOURCE, choices())

    let steps = runner.snapshot().steps
    expect(runner.snapshot().phase).toBe('failed')
    expect(steps.find((step) => step.id === 'serve')).toMatchObject({
      state: 'failed',
      detail: 'Domain flex.local is already taken'
    })
    expect(steps.find((step) => step.id === 'https')?.state).toBe('not-run')
    expect(steps.find((step) => step.id === 'import')?.state).toBe('not-run')
    expect(runner.completedSteps()).toEqual(['clone', 'register'])

    // The user turns Serve off and retries: no second clone, no second create.
    calls.length = 0
    await runner.retry(
      choices({
        serve: { enabled: false, stack: 'localwp', domain: 'flex.local' },
        import: {
          enabled: false,
          environment: 'main',
          toggles: allImportToggles(),
          confirmMismatch: false
        }
      })
    )
    steps = runner.snapshot().steps
    expect(calls).not.toContain('clone /Sites')
    expect(calls).not.toContain('sites.create')
    expect(steps.find((step) => step.id === 'serve')?.state).toBe('skipped')
    expect(steps.find((step) => step.id === 'https')?.state).toBe('skipped')
    expect(runner.snapshot().phase).toBe('done')
  })

  it('cancels the clone through cloneAbort while cloning', async () => {
    const api = fakeApi({ calls })
    let release: () => void = () => {}
    ;(api.repos.clone as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          release = () => reject(new Error('aborted'))
        })
    )
    const runner = createSiteSetupRunner(api)
    const running = runner.start(REPO_SOURCE, choices())
    await flush()
    expect(runner.snapshot().steps[0]).toMatchObject({
      id: 'clone',
      state: 'running',
      cancellable: true
    })
    runner.cancelCurrent()
    expect(calls).toContain('cloneAbort')
    release()
    await running
    expect(runner.snapshot().phase).toBe('failed')
  })

  it('cancels a running import through siteRuns.cancel with its run id', async () => {
    const events = { emit: (_event: unknown) => {} }
    const api = fakeApi({ calls, runEvents: events })
    const runner = createSiteSetupRunner(api)
    const running = runner.start(REPO_SOURCE, choices())
    for (let i = 0; i < 20 && !calls.includes('siteRuns.start'); i += 1) {
      await flush()
    }
    await flush()
    runner.cancelCurrent()
    expect(calls).toContain('siteRuns.cancel run-1')
    events.emit({ type: 'status', runId: 'run-1', status: 'cancelled' })
    await running
    expect(runner.snapshot().steps.find((step) => step.id === 'import')).toMatchObject({
      state: 'failed',
      detail: 'Cancelled'
    })
  })

  it('binds through siteBind.confirm for a link source with an existing checkout, and never clones', async () => {
    const api = fakeApi({ calls, plan: plan({}, false) })
    ;(api.siteBind.confirm as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push('siteBind.confirm')
      return {
        ok: true,
        value: {
          applied: { siteId: 'site-9', path: '/Sites/flex', secretError: 'No keychain' },
          summary: {}
        }
      }
    })
    const runner = createSiteSetupRunner(api)
    await runner.start(
      {
        kind: 'link',
        pending: {
          requestId: 'req-1',
          receivedAt: 0,
          fields: { reponame: 'efront_au/flex', checkoutBranch: '' } as never,
          passwordProvided: true,
          candidates: [],
          suggestedCloneUrl: ''
        },
        target: { kind: 'existing', path: '/Sites/flex' }
      },
      choices({ serve: { enabled: false, stack: 'localwp', domain: '' } })
    )
    expect(calls[0]).toBe('siteBind.confirm')
    expect(calls).not.toContain('clone /Sites')
    expect(runner.snapshot().siteId).toBe('site-9')
    expect(runner.snapshot().secretError).toBe('No keychain')
    expect(runner.snapshot().steps.map((step) => step.id)).toEqual([
      'register',
      'serve',
      'https',
      'import'
    ])
  })
})
