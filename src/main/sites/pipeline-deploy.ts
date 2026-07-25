// Deploy orchestration (local -> server), ported from backup.py:493-506.
//
// Stage order is the Python's and matters: the theme goes up first so a build failure aborts
// before anything on the server has been touched, then git pull, then the cache clear last so it
// invalidates everything the two preceding stages changed.
//
// Everything this slice does not own arrives by injection — the SSH session factory, the remote
// layout probe, and the two wp-config readers. The parent builds the real dependency object.

import { SiteRunStepError } from './pipeline-contract'
import type {
  RemoteLayout,
  SiteRunConfig,
  SiteRunContext,
  SiteSshSession
} from './pipeline-contract'
import { clearRemoteServerCache, pullRemoteGitChanges } from './remote-maintenance'
import { buildThemeDist, resolveThemeDeployPaths } from './theme-build'
import type { ThemeBuildDependencies } from './theme-build'
import { uploadThemeDist } from './theme-upload'
import type { ThemeUploadDependencies } from './theme-upload'

const STEP = 'deploy'

/** wp-config.php credentials for the remote database. `password` must never be logged. */
export type RemoteDbCredentials = {
  user: string
  password: string
  name: string
}

export type SiteDeployDependencies = {
  createSiteSshSession: (config: SiteRunConfig, signal: AbortSignal) => Promise<SiteSshSession>
  /** Also verifies wp-config.php at the resolved webroot and throws when it is absent. */
  resolveRemoteLayout: (session: SiteSshSession, rootPath: string) => Promise<RemoteLayout>
  readRemoteDbCredentials: (
    session: SiteSshSession,
    rootPath: string
  ) => Promise<RemoteDbCredentials>
  getActiveThemeViaSsh: (
    session: SiteSshSession,
    credentials: RemoteDbCredentials,
    rootPath: string
  ) => Promise<string>
  /** Stages this slice owns; overridden only by tests. */
  buildThemeDist?: typeof buildThemeDist
  uploadThemeDist?: typeof uploadThemeDist
  clearRemoteServerCache?: typeof clearRemoteServerCache
  pullRemoteGitChanges?: typeof pullRemoteGitChanges
  theme?: ThemeBuildDependencies & ThemeUploadDependencies
}

/** True when any selected deploy toggle needs the server; a run with none is a no-op. */
export function deployNeedsRemote(config: SiteRunConfig): boolean {
  const { deployThemes, gitPullOnServer, clearServerCache } = config.environment
  return deployThemes || gitPullOnServer || clearServerCache
}

function assertRemoteConfigured(config: SiteRunConfig): void {
  const { hostname, username, rootPath } = config.environment
  const missing = [
    hostname.trim() ? null : 'hostname',
    username.trim() ? null : 'username',
    rootPath.trim() ? null : 'remote root path'
  ].filter((field): field is string => field !== null)
  if (missing.length > 0) {
    throw new SiteRunStepError(
      STEP,
      `Remote configuration is incomplete: missing ${missing.join(', ')}.`
    )
  }
}

async function deployTheme(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  dependencies: SiteDeployDependencies,
  layout: RemoteLayout
): Promise<void> {
  const { rootPath } = config.environment
  context.status('Deploying theme')
  context.log('Theme deploy: finding active theme on server…')
  const credentials = await dependencies.readRemoteDbCredentials(session, rootPath)
  const activeTheme = (
    await dependencies.getActiveThemeViaSsh(session, credentials, rootPath)
  ).trim()
  if (!activeTheme) {
    throw new SiteRunStepError(STEP, 'Could not determine the active theme on the server.')
  }
  context.log(`Theme deploy: active theme is '${activeTheme}'`)

  const paths = resolveThemeDeployPaths(config, activeTheme, layout)
  context.throwIfCancelled()
  await (dependencies.buildThemeDist ?? buildThemeDist)(
    context,
    config,
    paths,
    dependencies.theme ?? {}
  )
  context.throwIfCancelled()
  await (dependencies.uploadThemeDist ?? uploadThemeDist)(
    context,
    session,
    paths,
    dependencies.theme ?? {}
  )
  context.log('Theme deploy: done')
}

export async function runSiteDeploy(
  context: SiteRunContext,
  config: SiteRunConfig,
  dependencies: SiteDeployDependencies
): Promise<void> {
  if (!deployNeedsRemote(config)) {
    context.log('Nothing selected to deploy.')
    return
  }
  assertRemoteConfigured(config)
  context.throwIfCancelled()

  context.status('Connecting to server')
  const session = await dependencies.createSiteSshSession(config, context.signal)
  try {
    const layout = await dependencies.resolveRemoteLayout(session, config.environment.rootPath)
    context.log(`Remote layout: webroot ${layout.webroot}, content directory ${layout.contentDir}`)

    if (config.environment.deployThemes) {
      context.throwIfCancelled()
      await deployTheme(context, config, session, dependencies, layout)
    }
    if (config.environment.gitPullOnServer) {
      context.throwIfCancelled()
      await (dependencies.pullRemoteGitChanges ?? pullRemoteGitChanges)(context, config, session)
    }
    if (config.environment.clearServerCache) {
      context.throwIfCancelled()
      await (dependencies.clearRemoteServerCache ?? clearRemoteServerCache)(
        context,
        config,
        session
      )
    }
    context.throwIfCancelled()
    context.status('Deploy complete')
  } finally {
    await session.close()
  }
}
