import { describe, expect, it } from 'vitest'

import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { SiteEnvironment } from '../../shared/site-types'
import { deployNeedsRemote, runSiteDeploy } from './pipeline-deploy'
import type { RemoteDbCredentials, SiteDeployDependencies } from './pipeline-deploy'
import { SiteRunCancelledError, SiteRunStepError } from './pipeline-contract'
import type { SiteRunConfig, SiteRunContext, SiteSshSession } from './pipeline-contract'
import type { ThemeDeployPaths } from './theme-build'

const CREDENTIALS: RemoteDbCredentials = {
  user: 'acme_db',
  password: 'super-secret-db-password',
  name: 'acme_wp'
}

type Recorder = {
  context: SiteRunContext
  logs: string[]
  stages: string[]
  cancel: () => void
}

function createRecordingContext(): Recorder {
  const controller = new AbortController()
  const logs: string[] = []
  const stages: string[] = []
  return {
    logs,
    stages,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: (stage) => stages.push(stage),
      progress: () => {},
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

function createConfig(environment: Partial<SiteEnvironment> = {}): SiteRunConfig {
  const resolved: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    hostname: 'acme.example.com',
    username: 'acme',
    rootPath: 'public_html',
    ...environment
  }
  return {
    site: {
      id: 'site-1',
      path: '/sites/acme',
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
      environments: { main: resolved },
      notes: '',
      searchReplaceTimeoutSeconds: 600
    },
    environmentName: 'main',
    environment: resolved,
    group: 'deploy',
    wpDir: '/sites/acme',
    sshPassword: 'super-secret-ssh-password',
    dbPassword: CREDENTIALS.password
  }
}

type Harness = {
  dependencies: SiteDeployDependencies
  /** Ordered record of every stage that actually ran. */
  trace: string[]
  sessions: number
  closes: number
  builtPaths: ThemeDeployPaths[]
  uploadedPaths: ThemeDeployPaths[]
}

function createHarness(
  options: Partial<SiteDeployDependencies> & { activeTheme?: string } = {}
): Harness {
  const { activeTheme, ...overrides } = options
  const trace: string[] = []
  const builtPaths: ThemeDeployPaths[] = []
  const uploadedPaths: ThemeDeployPaths[] = []
  const harness: Harness = {
    trace,
    sessions: 0,
    closes: 0,
    builtPaths,
    uploadedPaths,
    dependencies: {
      createSiteSshSession: async () => {
        harness.sessions += 1
        trace.push('connect')
        const session: SiteSshSession = {
          exec: async () => ({ code: 0, stdout: '', stderr: '' }),
          download: async () => {},
          upload: async () => {},
          writeSecureRemoteFile: async () => {},
          removeRemoteFile: async () => {},
          close: async () => {
            harness.closes += 1
            trace.push('close')
          }
        }
        return session
      },
      resolveRemoteLayout: async () => {
        trace.push('layout')
        return { webroot: 'public_html', contentDir: 'wp-content' }
      },
      readRemoteDbCredentials: async () => {
        trace.push('db-credentials')
        return CREDENTIALS
      },
      getActiveThemeViaSsh: async () => {
        trace.push('active-theme')
        return activeTheme ?? 'acme-theme'
      },
      buildThemeDist: async (_context, _config, paths) => {
        trace.push('build')
        builtPaths.push(paths)
      },
      uploadThemeDist: async (_context, _session, paths) => {
        trace.push('upload')
        uploadedPaths.push(paths)
      },
      pullRemoteGitChanges: async () => {
        trace.push('git-pull')
      },
      clearRemoteServerCache: async () => {
        trace.push('clear-cache')
      },
      ...overrides
    }
  }
  return harness
}

describe('deployNeedsRemote', () => {
  it('is false when no deploy toggle is selected', () => {
    expect(deployNeedsRemote(createConfig())).toBe(false)
  })

  it.each([['deployThemes'], ['gitPullOnServer'], ['clearServerCache']] as const)(
    'is true when %s alone is selected',
    (toggle) => {
      expect(deployNeedsRemote(createConfig({ [toggle]: true }))).toBe(true)
    }
  )
})

describe('runSiteDeploy', () => {
  it('does nothing and never connects when no toggle is selected', async () => {
    const { context, logs } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(context, createConfig(), harness.dependencies)

    expect(harness.sessions).toBe(0)
    expect(harness.trace).toEqual([])
    expect(logs).toEqual(['Nothing selected to deploy.'])
  })

  it.each([
    ['hostname', { hostname: '  ' }],
    ['username', { username: '' }],
    ['remote root path', { rootPath: '' }]
  ])('refuses to connect when the %s is missing', async (field, environment) => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    const error = await runSiteDeploy(
      context,
      createConfig({ deployThemes: true, ...environment }),
      harness.dependencies
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SiteRunStepError)
    expect((error as SiteRunStepError).message).toContain(field)
    expect(harness.sessions).toBe(0)
  })

  it('runs only the theme stage when only deployThemes is selected', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)

    expect(harness.trace).toEqual([
      'connect',
      'layout',
      'db-credentials',
      'active-theme',
      'build',
      'upload',
      'close'
    ])
  })

  it('runs only the git pull when only gitPullOnServer is selected', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(context, createConfig({ gitPullOnServer: true }), harness.dependencies)

    expect(harness.trace).toEqual(['connect', 'layout', 'git-pull', 'close'])
  })

  it('runs only the cache clear when only clearServerCache is selected', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(context, createConfig({ clearServerCache: true }), harness.dependencies)

    expect(harness.trace).toEqual(['connect', 'layout', 'clear-cache', 'close'])
  })

  it('keeps the ocsites stage order: theme, then git pull, then cache clear', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(
      context,
      createConfig({ deployThemes: true, gitPullOnServer: true, clearServerCache: true }),
      harness.dependencies
    )

    expect(harness.trace).toEqual([
      'connect',
      'layout',
      'db-credentials',
      'active-theme',
      'build',
      'upload',
      'git-pull',
      'clear-cache',
      'close'
    ])
  })

  it('derives the theme paths from the theme the server reports, trimmed', async () => {
    const { context, logs } = createRecordingContext()
    const harness = createHarness({ activeTheme: '  twentytwentyfour \n' })

    await runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)

    expect(harness.builtPaths[0]?.remoteZipName).toBe('twentytwentyfour_dist.zip')
    expect(harness.uploadedPaths[0]).toBe(harness.builtPaths[0])
    expect(logs).toContain("Theme deploy: active theme is 'twentytwentyfour'")
  })

  it('fails before building when the server reports no active theme', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness({ activeTheme: '   ' })

    await expect(
      runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)
    ).rejects.toThrowError('Could not determine the active theme on the server.')
    expect(harness.trace).not.toContain('build')
    expect(harness.closes).toBe(1)
  })

  it('closes the session when a stage throws', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness({
      buildThemeDist: async () => {
        throw new SiteRunStepError('theme-build', 'Theme build failed (exit 1)')
      }
    })

    await expect(
      runSiteDeploy(
        context,
        createConfig({ deployThemes: true, gitPullOnServer: true }),
        harness.dependencies
      )
    ).rejects.toThrowError('Theme build failed (exit 1)')
    expect(harness.closes).toBe(1)
    expect(harness.trace).not.toContain('git-pull')
  })

  it('closes the session when the remote layout probe rejects', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness({
      resolveRemoteLayout: async () => {
        throw new SiteRunStepError('remote-layout', 'wp-config.php not found in public_html')
      }
    })

    await expect(
      runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)
    ).rejects.toThrowError('wp-config.php not found in public_html')
    expect(harness.closes).toBe(1)
  })

  it('logs the resolved remote layout so a Bedrock target is visible in the run log', async () => {
    const { context, logs } = createRecordingContext()
    const harness = createHarness({
      resolveRemoteLayout: async () => ({ webroot: 'public_html/web', contentDir: 'app' })
    })

    await runSiteDeploy(context, createConfig({ clearServerCache: true }), harness.dependencies)

    expect(logs).toContain('Remote layout: webroot public_html/web, content directory app')
  })

  it('feeds the resolved layout into the theme paths, so Bedrock targets web/app', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness({
      resolveRemoteLayout: async () => ({ webroot: 'public_html/web', contentDir: 'app' })
    })

    await runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)

    expect(harness.builtPaths[0]?.remoteDistParent).toBe(
      'public_html/web/app/themes/acme-theme/assets'
    )
  })

  it('targets wp-content under the root for a standard layout', async () => {
    const { context } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)

    expect(harness.builtPaths[0]?.remoteDistParent).toBe(
      'public_html/wp-content/themes/acme-theme/assets'
    )
  })

  it('cancels between the theme stage and the git pull', async () => {
    const { context, cancel } = createRecordingContext()
    const harness = createHarness({
      uploadThemeDist: async () => {
        cancel()
      }
    })

    await expect(
      runSiteDeploy(
        context,
        createConfig({ deployThemes: true, gitPullOnServer: true, clearServerCache: true }),
        harness.dependencies
      )
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(harness.trace).not.toContain('git-pull')
    expect(harness.trace).not.toContain('clear-cache')
    expect(harness.closes).toBe(1)
  })

  it('cancels between the git pull and the cache clear', async () => {
    const { context, cancel } = createRecordingContext()
    const harness = createHarness({
      pullRemoteGitChanges: async () => {
        cancel()
      }
    })

    await expect(
      runSiteDeploy(
        context,
        createConfig({ gitPullOnServer: true, clearServerCache: true }),
        harness.dependencies
      )
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(harness.trace).not.toContain('clear-cache')
    expect(harness.closes).toBe(1)
  })

  it('cancels before connecting when the run was already aborted', async () => {
    const { context, cancel } = createRecordingContext()
    const harness = createHarness()
    cancel()

    await expect(
      runSiteDeploy(context, createConfig({ deployThemes: true }), harness.dependencies)
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(harness.sessions).toBe(0)
  })

  it('passes the run signal to the session factory so a cancel tears the connection down', async () => {
    const { context } = createRecordingContext()
    let receivedSignal: AbortSignal | null = null
    const harness = createHarness()
    const spied: SiteDeployDependencies = {
      ...harness.dependencies,
      createSiteSshSession: async (config, signal) => {
        receivedSignal = signal
        return harness.dependencies.createSiteSshSession(config, signal)
      }
    }

    await runSiteDeploy(context, createConfig({ clearServerCache: true }), spied)

    expect(receivedSignal).toBe(context.signal)
  })

  it('never writes a password into the run log', async () => {
    const { context, logs } = createRecordingContext()
    const harness = createHarness()

    await runSiteDeploy(
      context,
      createConfig({ deployThemes: true, gitPullOnServer: true, clearServerCache: true }),
      harness.dependencies
    )

    const transcript = logs.join('\n')
    expect(transcript).not.toContain(CREDENTIALS.password)
    expect(transcript).not.toContain('super-secret-ssh-password')
  })
})
