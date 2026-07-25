import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { StreamCommandOptions, StreamCommandResult } from '../lib/stream-command'
import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { SiteEnvironment } from '../../shared/site-types'
import { SiteRunCancelledError, SiteRunStepError } from './pipeline-contract'
import type { RemoteLayout, SiteRunConfig, SiteRunContext } from './pipeline-contract'
import {
  buildThemeDist,
  DEFAULT_THEME_BUILD_COMMAND,
  resolveThemeBuildCommand,
  resolveThemeDeployPaths,
  THEME_BUILD_TIMEOUT_MS
} from './theme-build'

const THEME = 'acme-theme'

/** Bedrock layouts are covered in theme-deploy-bedrock.test.ts; these cases pin the standard tree. */
const STANDARD_LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }

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

function createConfig(wpDir: string, environment: Partial<SiteEnvironment> = {}): SiteRunConfig {
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
      path: wpDir,
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
    wpDir,
    sshPassword: 'ssh-secret',
    dbPassword: 'db-secret'
  }
}

type RunnerCall = { command: string; args: string[]; options?: StreamCommandOptions }
type RunnerHandler = (call: RunnerCall) => Promise<Partial<StreamCommandResult>>

function createFakeRunner(handler: RunnerHandler): {
  run: (
    command: string,
    args: string[],
    options?: StreamCommandOptions
  ) => Promise<StreamCommandResult>
  calls: RunnerCall[]
} {
  const calls: RunnerCall[] = []
  return {
    calls,
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      const partial = await handler({ command, args, options })
      return {
        code: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        truncated: false,
        stoppedEarly: false,
        ...partial
      }
    }
  }
}

describe('resolveThemeDeployPaths', () => {
  it('defaults to wp-content/themes/<theme>/assets/dist on both sides', () => {
    const paths = resolveThemeDeployPaths(createConfig('/sites/acme'), THEME, STANDARD_LAYOUT)

    expect(paths).toEqual({
      localDistPath: `/sites/acme/wp-content/themes/${THEME}/assets/dist`,
      remoteDistParent: `public_html/wp-content/themes/${THEME}/assets`,
      distBasename: 'dist',
      localZipPath: `/sites/acme/${THEME}_dist.zip`,
      remoteZipName: `${THEME}_dist.zip`
    })
  })

  it('substitutes <theme> in a relative override and mirrors it remotely', () => {
    const paths = resolveThemeDeployPaths(
      createConfig('/sites/acme', { themeDistPath: 'wp-content/themes/<theme>/build' }),
      THEME,
      STANDARD_LAYOUT
    )

    expect(paths.localDistPath).toBe(`/sites/acme/wp-content/themes/${THEME}/build`)
    expect(paths.remoteDistParent).toBe(`public_html/wp-content/themes/${THEME}`)
    expect(paths.distBasename).toBe('build')
  })

  it('strips a trailing slash before deriving the basename', () => {
    const paths = resolveThemeDeployPaths(
      createConfig('/sites/acme', { themeDistPath: 'assets/build//' }),
      THEME,
      STANDARD_LAYOUT
    )

    expect(paths.localDistPath).toBe('/sites/acme/assets/build')
    expect(paths.remoteDistParent).toBe('public_html/assets')
    expect(paths.distBasename).toBe('build')
  })

  it('keeps the default remote layout for an absolute override, which cannot be mirrored', () => {
    const paths = resolveThemeDeployPaths(
      createConfig('/sites/acme', { themeDistPath: '/Volumes/build/<theme>/dist' }),
      THEME,
      STANDARD_LAYOUT
    )

    expect(paths.localDistPath).toBe(`/Volumes/build/${THEME}/dist`)
    expect(paths.remoteDistParent).toBe(`public_html/wp-content/themes/${THEME}/assets`)
    expect(paths.distBasename).toBe('dist')
  })

  it('treats an override that is only slashes as unset', () => {
    const paths = resolveThemeDeployPaths(
      createConfig('/sites/acme', { themeDistPath: '/' }),
      THEME,
      STANDARD_LAYOUT
    )

    expect(paths.localDistPath).toBe(`/sites/acme/wp-content/themes/${THEME}/assets/dist`)
    expect(paths.distBasename).toBe('dist')
  })

  it('stages the zip next to the WordPress root, named after the theme', () => {
    const paths = resolveThemeDeployPaths(
      createConfig('/sites/acme'),
      'twentytwentyfour',
      STANDARD_LAYOUT
    )

    expect(paths.localZipPath).toBe('/sites/acme/twentytwentyfour_dist.zip')
    expect(paths.remoteZipName).toBe('twentytwentyfour_dist.zip')
  })
})

describe('resolveThemeBuildCommand', () => {
  let buildDir: string

  beforeEach(async () => {
    buildDir = await mkdtemp(path.join(tmpdir(), 'muster-theme-cmd-'))
  })

  afterEach(async () => {
    await rm(buildDir, { recursive: true, force: true })
  })

  it('falls back to the ocsites default when no command is configured', async () => {
    const resolved = await resolveThemeBuildCommand(buildDir, '   ')

    expect(resolved.command).toBe(DEFAULT_THEME_BUILD_COMMAND)
    // The default already runs `npm ci`, so nothing may be prepended.
    expect(resolved.installCommand).toBeNull()
  })

  it('prepends npm install when node_modules is missing and there is no lockfile', async () => {
    const resolved = await resolveThemeBuildCommand(buildDir, 'npm run build:prod')

    expect(resolved.installCommand).toBe('npm install')
    expect(resolved.command).toBe('npm install && npm run build:prod')
  })

  it('prefers npm ci when a package-lock.json is present', async () => {
    await writeFile(path.join(buildDir, 'package-lock.json'), '{}')

    const resolved = await resolveThemeBuildCommand(buildDir, 'npm run build:prod')

    expect(resolved.installCommand).toBe('npm ci')
    expect(resolved.command).toBe('npm ci && npm run build:prod')
  })

  it('does not prepend anything once node_modules exists', async () => {
    await mkdir(path.join(buildDir, 'node_modules'))

    const resolved = await resolveThemeBuildCommand(buildDir, 'npm run build:prod')

    expect(resolved.installCommand).toBeNull()
    expect(resolved.command).toBe('npm run build:prod')
  })

  it('ignores a node_modules that is a file rather than a directory', async () => {
    await writeFile(path.join(buildDir, 'node_modules'), 'not a directory')

    const resolved = await resolveThemeBuildCommand(buildDir, 'npm run build:prod')

    expect(resolved.installCommand).toBe('npm install')
  })

  it.each([
    ['npm ci && npm run build'],
    ['npm install && npm run build'],
    ['npm i --no-audit && npm run build'],
    ['export CXXFLAGS="--std=c++17" && npm ci && npm run build:prod']
  ])('does not prepend an install to %j, which already installs', async (configured) => {
    const resolved = await resolveThemeBuildCommand(buildDir, configured)

    expect(resolved.installCommand).toBeNull()
    expect(resolved.command).toBe(configured)
  })

  it('leaves a non-npm build command alone even without node_modules', async () => {
    const resolved = await resolveThemeBuildCommand(buildDir, 'gulp build --production')

    expect(resolved.installCommand).toBeNull()
    expect(resolved.command).toBe('gulp build --production')
  })

  it('does not treat a command that merely mentions npmrc as an npm build', async () => {
    const resolved = await resolveThemeBuildCommand(buildDir, 'cat .npmrc && yarn build')

    expect(resolved.installCommand).toBeNull()
    expect(resolved.command).toBe('cat .npmrc && yarn build')
  })
})

describe('buildThemeDist', () => {
  let wpDir: string

  beforeEach(async () => {
    wpDir = await mkdtemp(path.join(tmpdir(), 'muster-theme-build-'))
  })

  afterEach(async () => {
    await rm(wpDir, { recursive: true, force: true })
  })

  /** Stands in for a successful build: writes one file into the dist directory. */
  async function populateDist(distPath: string): Promise<void> {
    await mkdir(distPath, { recursive: true })
    await writeFile(path.join(distPath, 'main.css'), 'body{}')
  }

  it('runs the configured command under /bin/sh in the WordPress root', async () => {
    const { context, stages } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run })

    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.command).toBe('/bin/sh')
    expect(runner.calls[0]!.args).toEqual(['-c', 'npm ci && npm run build'])
    expect(runner.calls[0]!.options?.cwd).toBe(wpDir)
    expect(runner.calls[0]!.options?.timeoutMs).toBe(THEME_BUILD_TIMEOUT_MS)
    expect(stages).toEqual(['Building theme'])
  })

  it('honours a timeout override', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run, timeoutMs: 1_000 })

    expect(runner.calls[0]!.options?.timeoutMs).toBe(1_000)
  })

  it('removes the previous dist directory before building', async () => {
    const { context, logs } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    await mkdir(paths.localDistPath, { recursive: true })
    await writeFile(path.join(paths.localDistPath, 'stale.css'), 'stale')

    let staleSurvived = true
    const runner = createFakeRunner(async () => {
      staleSurvived = await stat(path.join(paths.localDistPath, 'stale.css'))
        .then(() => true)
        .catch(() => false)
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run })

    expect(staleSurvived).toBe(false)
    expect(logs).toContain('Theme deploy: removing previous dist files…')
  })

  it('auto-installs dependencies when node_modules is missing', async () => {
    const { context, logs } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm run build:prod' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run })

    expect(runner.calls[0]!.args[1]).toBe('npm install && npm run build:prod')
    expect(logs).toContain('Theme deploy: node_modules missing — running npm install…')
  })

  it('surfaces only the last 20 lines of a failed build', async () => {
    const { context, logs } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async (call) => {
      for (let index = 1; index <= 30; index += 1) {
        call.options?.onStdout?.(`line-${index}\n`)
      }
      return { code: 2 }
    })

    const error = await buildThemeDist(context, config, paths, {
      runCommand: runner.run
    }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SiteRunStepError)
    const message = (error as SiteRunStepError).message
    expect(message).toContain('exit 2')
    expect(message).toContain('line-30')
    expect(message).toContain('line-11')
    expect(message).not.toContain('line-10')
    // The full stream still reaches the run log even though only the tail is reported.
    expect(logs).toContain('line-1')
  })

  it('merges stderr into the reported tail and flushes a trailing partial line', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async (call) => {
      call.options?.onStdout?.('building\r\n')
      call.options?.onStderr?.('gyp ERR! no trailing newline')
      return { code: 1 }
    })

    const error = await buildThemeDist(context, config, paths, {
      runCommand: runner.run
    }).catch((thrown: unknown) => thrown)

    expect((error as SiteRunStepError).message).toContain('building\ngyp ERR! no trailing newline')
  })

  it('reports (no output) when a failed build said nothing', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => ({ code: 127 }))

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toThrowError('(no output)')
  })

  it('reports a timeout distinctly from a non-zero exit', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async (call) => {
      call.options?.onStdout?.('waiting for input\n')
      return { code: -1, timedOut: true }
    })

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toThrowError(/timed out:\nwaiting for input/)
  })

  it('fails when the dist directory is empty after a successful build', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await mkdir(paths.localDistPath, { recursive: true })
      return {}
    })

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toThrowError(`Local dist path is empty after build: ${paths.localDistPath}`)
  })

  it('fails when the build never created the dist directory at all', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => ({}))

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toThrowError('Local dist path is empty after build')
  })

  it('runs under bash with nvm when engines.node is pinned and nvm.sh exists', async () => {
    const { context, logs } = createRecordingContext()
    await writeFile(
      path.join(wpDir, 'package.json'),
      JSON.stringify({ engines: { node: '>=20.11' } })
    )
    const nvmScriptPath = path.join(wpDir, 'nvm.sh')
    await writeFile(nvmScriptPath, '# nvm')
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run, nvmScriptPath })

    expect(runner.calls[0]!.command).toBe('/bin/bash')
    expect(runner.calls[0]!.args[1]).toBe(
      `. '${nvmScriptPath}' && nvm use '20.11' && npm ci && npm run build`
    )
    expect(logs).toContain('Theme deploy: using Node 20.11 via nvm')
  })

  it('skips nvm when the pinned version has no nvm.sh to source', async () => {
    const { context, logs } = createRecordingContext()
    await writeFile(path.join(wpDir, 'package.json'), JSON.stringify({ engines: { node: '20' } }))
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, {
      runCommand: runner.run,
      nvmScriptPath: path.join(wpDir, 'absent-nvm.sh')
    })

    expect(runner.calls[0]!.command).toBe('/bin/sh')
    expect(runner.calls[0]!.args[1]).toBe('npm ci && npm run build')
    expect(logs).not.toContain('Theme deploy: using Node 20 via nvm')
  })

  it('skips nvm when package.json pins nothing, even with nvm installed', async () => {
    const { context } = createRecordingContext()
    const nvmScriptPath = path.join(wpDir, 'nvm.sh')
    await writeFile(nvmScriptPath, '# nvm')
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run, nvmScriptPath })

    expect(runner.calls[0]!.command).toBe('/bin/sh')
  })

  it('quotes an nvm path containing a space', async () => {
    const { context } = createRecordingContext()
    await writeFile(path.join(wpDir, 'package.json'), JSON.stringify({ engines: { node: '18' } }))
    const nvmDir = path.join(wpDir, 'my nvm')
    await mkdir(nvmDir)
    const nvmScriptPath = path.join(nvmDir, 'nvm.sh')
    await writeFile(nvmScriptPath, '# nvm')
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run, nvmScriptPath })

    expect(runner.calls[0]!.args[1]).toContain(`. '${nvmScriptPath}' &&`)
  })

  it('refuses to start when the run is already cancelled', async () => {
    const { context, cancel } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => ({}))
    cancel()

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(runner.calls).toHaveLength(0)
  })

  it('translates the runner AbortError into SiteRunCancelledError', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      throw error
    })

    await expect(
      buildThemeDist(context, config, paths, { runCommand: runner.run })
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
  })

  it('passes the run signal through so a cancel kills the build tree', async () => {
    const { context } = createRecordingContext()
    const config = createConfig(wpDir, { deployCommand: 'npm ci && npm run build' })
    const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)
    const runner = createFakeRunner(async () => {
      await populateDist(paths.localDistPath)
      return {}
    })

    await buildThemeDist(context, config, paths, { runCommand: runner.run })

    expect(runner.calls[0]!.options?.signal).toBe(context.signal)
  })

  // The fakes above pin the decision logic; these two run the real spawn so the /bin/sh
  // invocation shape and the streamed tail capture are exercised end to end. Shell only.
  describe.skipIf(process.platform === 'win32')('against the real command runner', () => {
    it('builds through /bin/sh and accepts a populated dist', async () => {
      const { context, stages } = createRecordingContext()
      const config = createConfig(wpDir, {
        deployCommand:
          'mkdir -p wp-content/themes/acme-theme/assets/dist && echo body{} > wp-content/themes/acme-theme/assets/dist/main.css'
      })
      const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)

      await buildThemeDist(context, config, paths)

      await expect(stat(path.join(paths.localDistPath, 'main.css'))).resolves.toBeDefined()
      expect(stages).toEqual(['Building theme'])
    })

    it('surfaces the real last 20 lines when the shell command fails', async () => {
      const { context } = createRecordingContext()
      const config = createConfig(wpDir, {
        deployCommand: 'for i in $(seq 1 30); do echo "line-$i"; done; exit 3'
      })
      const paths = resolveThemeDeployPaths(config, THEME, STANDARD_LAYOUT)

      const error = await buildThemeDist(context, config, paths).catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(SiteRunStepError)
      const message = (error as SiteRunStepError).message
      expect(message).toContain('exit 3')
      expect(message).toContain('line-30')
      expect(message).toContain('line-11')
      expect(message).not.toContain('line-10')
    })
  })
})
