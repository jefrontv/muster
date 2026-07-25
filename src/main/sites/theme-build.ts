// Local half of the ocsites theme deploy (deploy/server.py:64-149): resolve where the built dist
// lives, wipe the previous build, then run the theme's build command — optionally under an
// nvm-pinned Node. Build output streams to the run log; only the tail is retained for a failure.

import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { streamCommand } from '../lib/stream-command'
import type { StreamCommandResult } from '../lib/stream-command'
import { resolvePinnedNodeVersion } from './node-version-resolver'
import { SiteRunCancelledError, SiteRunStepError, quoteShellArgument } from './pipeline-contract'
import type { RemoteLayout, SiteRunConfig, SiteRunContext } from './pipeline-contract'

const STEP = 'theme-build'

/** ocsites' default. CXXFLAGS is what lets node-gyp addons (node-sass) build on a modern toolchain. */
export const DEFAULT_THEME_BUILD_COMMAND =
  'export CXXFLAGS="--std=c++17" && npm ci && npm run build:prod'

/** server.py:139. A build has no partial state, and npm can wedge on a prompt forever. */
export const THEME_BUILD_TIMEOUT_MS = 900_000

const FAILURE_TAIL_LINES = 20

/** Substrings that mean the configured command installs dependencies itself. */
const INSTALL_FRAGMENTS = ['npm ci', 'npm install', 'npm i ']

export type ThemeDeployPaths = {
  /** Local directory the build writes into; also the zip's content root. */
  localDistPath: string
  /** Remote parent that will contain `distBasename`. Server-side, always POSIX. */
  remoteDistParent: string
  distBasename: string
  /** Zip staged next to the WordPress root, as in ocsites. */
  localZipPath: string
  remoteZipName: string
}

export type ThemeBuildDependencies = {
  runCommand?: typeof streamCommand
  /** Defaults to ~/.nvm/nvm.sh; overridden in tests. */
  nvmScriptPath?: string
  timeoutMs?: number
}

/** The theme stage shells out to sh/bash/npm/zip, so it is macOS and Linux only. */
export function assertPosixDeployHost(step: string): void {
  if (process.platform === 'win32') {
    throw new SiteRunStepError(step, 'Theme deploy requires macOS or Linux (POSIX shell tooling).')
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function directoryExists(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * server.py:70-89, with one ruled divergence: ocsites hardcoded `wp-content` and the SSH root for
 * the REMOTE theme path, so a Bedrock deploy uploaded the theme to a directory WordPress never
 * reads. Both now come from the resolved layout — `contentDir` ('app' under Bedrock) and `webroot`,
 * which is the directory `wpDir` mirrors locally (backup.py extracts base.zip from webroot into
 * wpDir). Canonical Bedrock serves from `<root>/web`, so the webroot half is not optional.
 *
 * Local paths stay on the standard `wp-content` tree: a Bedrock checkout still builds there, and
 * `themeDistPath` is the escape hatch when it does not.
 *
 * An absolute override cannot be mirrored onto the server, so the remote side then keeps the
 * default `<webroot>/<contentDir>/themes/<theme>/assets/dist` layout.
 */
export function resolveThemeDeployPaths(
  config: SiteRunConfig,
  activeTheme: string,
  layout: RemoteLayout
): ThemeDeployPaths {
  const { themeDistPath } = config.environment
  const localRelative = path.posix.join('wp-content', 'themes', activeTheme, 'assets', 'dist')
  const remoteRelative = path.posix.join(layout.contentDir, 'themes', activeTheme, 'assets', 'dist')
  const defaultRemoteParent = path.posix.join(layout.webroot, path.posix.dirname(remoteRelative))
  const remoteZipName = `${activeTheme}_dist.zip`
  const shared = { localZipPath: path.join(config.wpDir, remoteZipName), remoteZipName }
  const override = themeDistPath.replaceAll('<theme>', activeTheme).replace(/\/+$/, '')

  if (!override) {
    return {
      localDistPath: path.join(config.wpDir, localRelative),
      remoteDistParent: defaultRemoteParent,
      distBasename: 'dist',
      ...shared
    }
  }
  if (path.isAbsolute(override)) {
    return {
      localDistPath: override,
      remoteDistParent: defaultRemoteParent,
      distBasename: 'dist',
      ...shared
    }
  }
  // A local override written against the standard tree still has to land in Bedrock's content dir.
  const remoteOverride = override.startsWith('wp-content/')
    ? path.posix.join(layout.contentDir, override.slice('wp-content/'.length))
    : override
  return {
    localDistPath: path.join(config.wpDir, override),
    remoteDistParent: path.posix.join(layout.webroot, path.posix.dirname(remoteOverride)),
    distBasename: path.posix.basename(override) || 'dist',
    ...shared
  }
}

/**
 * server.py:104-118. Without this, `npm run …` invokes a node_modules/.bin binary that was never
 * installed and the build dies with exit 127.
 */
export async function resolveThemeBuildCommand(
  buildDir: string,
  configuredCommand: string
): Promise<{ command: string; installCommand: string | null }> {
  const command = configuredCommand.trim() || DEFAULT_THEME_BUILD_COMMAND
  const isNpmBuild = command.split(/\s+/).includes('npm')
  const alreadyInstalls = INSTALL_FRAGMENTS.some((fragment) => command.includes(fragment))
  if (
    !isNpmBuild ||
    alreadyInstalls ||
    (await directoryExists(path.join(buildDir, 'node_modules')))
  ) {
    return { command, installCommand: null }
  }
  const installCommand = (await pathExists(path.join(buildDir, 'package-lock.json')))
    ? 'npm ci'
    : 'npm install'
  return { command: `${installCommand} && ${command}`, installCommand }
}

type BuildOutputTail = {
  record: (chunk: string) => void
  /** Flushes any partial line, then returns the retained tail. */
  flush: () => string
}

function createBuildOutputTail(context: SiteRunContext): BuildOutputTail {
  const lines: string[] = []
  let pending = ''
  const push = (line: string): void => {
    context.log(line)
    lines.push(line)
    if (lines.length > FAILURE_TAIL_LINES) {
      lines.shift()
    }
  }
  return {
    record: (chunk) => {
      pending += chunk
      const parts = pending.split('\n')
      pending = parts.pop() ?? ''
      for (const part of parts) {
        push(part.replace(/\r$/, ''))
      }
    },
    flush: () => {
      if (pending) {
        push(pending)
        pending = ''
      }
      return lines.join('\n') || '(no output)'
    }
  }
}

/** streamCommand rejects with an AbortError on cancel; pipelines speak SiteRunCancelledError. */
export async function runDeployShellScript(
  run: typeof streamCommand,
  shell: string,
  script: string,
  options: {
    cwd: string
    signal: AbortSignal
    timeoutMs?: number
    onOutput?: (chunk: string) => void
  }
): Promise<StreamCommandResult> {
  try {
    return await run(shell, ['-c', script], {
      cwd: options.cwd,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      onStdout: options.onOutput,
      onStderr: options.onOutput
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SiteRunCancelledError()
    }
    throw error
  }
}

async function assertDistNotEmpty(localDistPath: string): Promise<void> {
  const entries = await readdir(localDistPath).catch(() => [])
  if (entries.length === 0) {
    throw new SiteRunStepError(STEP, `Local dist path is empty after build: ${localDistPath}`)
  }
}

export async function buildThemeDist(
  context: SiteRunContext,
  config: SiteRunConfig,
  paths: ThemeDeployPaths,
  dependencies: ThemeBuildDependencies = {}
): Promise<void> {
  assertPosixDeployHost(STEP)
  const buildDir = config.wpDir
  context.throwIfCancelled()

  if (await pathExists(paths.localDistPath)) {
    context.log('Theme deploy: removing previous dist files…')
    await rm(paths.localDistPath, { recursive: true, force: true })
  }

  const nodeVersion = await resolvePinnedNodeVersion(buildDir)
  const nvmScriptPath = dependencies.nvmScriptPath ?? path.join(homedir(), '.nvm', 'nvm.sh')
  const nvmVersion = nodeVersion !== null && (await pathExists(nvmScriptPath)) ? nodeVersion : null
  if (nvmVersion !== null) {
    context.log(`Theme deploy: using Node ${nvmVersion} via nvm`)
  }

  const { command, installCommand } = await resolveThemeBuildCommand(
    buildDir,
    config.environment.deployCommand
  )
  if (installCommand) {
    context.log(`Theme deploy: node_modules missing — running ${installCommand}…`)
  }

  context.status('Building theme')
  const output = createBuildOutputTail(context)
  // nvm.sh is a bash function library, so that path needs bash rather than sh.
  const script =
    nvmVersion === null
      ? command
      : `. ${quoteShellArgument(nvmScriptPath)} && nvm use ${quoteShellArgument(nvmVersion)} && ${command}`
  const result = await runDeployShellScript(
    dependencies.runCommand ?? streamCommand,
    nvmVersion === null ? '/bin/sh' : '/bin/bash',
    script,
    {
      cwd: buildDir,
      signal: context.signal,
      timeoutMs: dependencies.timeoutMs ?? THEME_BUILD_TIMEOUT_MS,
      onOutput: output.record
    }
  )

  const tail = output.flush()
  if (result.timedOut) {
    throw new SiteRunStepError(STEP, `Theme build timed out:\n${tail}`)
  }
  if (result.code !== 0) {
    throw new SiteRunStepError(STEP, `Theme build failed (exit ${result.code}):\n${tail}`)
  }
  context.log('Theme deploy: build complete')
  await assertDistNotEmpty(paths.localDistPath)
}
