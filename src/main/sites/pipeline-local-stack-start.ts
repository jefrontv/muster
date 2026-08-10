// The import pipeline's first step: bring the site's local stack up and adopt the transport it
// reports.
//
// Split out of pipeline-import.ts because it is the one step that differs per stack, and keeping it
// here means the pipeline reads the same for all of them.

import type { Site } from '../../shared/site-types'
import { providerFor } from './local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import './agent-local-site-control'
import { SiteRunStepError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

export const LOCAL_STACK_STEP = 'ensure-local-stack-running'

/** MySQL's default, which needs no mention in a log line. */
const MYSQL_DEFAULT_PORT = 3306

export type LocalStackRunningOutcome = {
  ok: boolean
  /** Empty when the stack is not socket-based (agent-local, MAMP) or not managing this site. */
  socketPath: string
  message: string
  /** TCP stacks report their transport and live credentials here instead of a socket. */
  port?: number | null
  user?: string
  password?: string
  /** The database the stack owns for this site, when it owns the naming (agent-local: al_<slug>). */
  database?: string
}

/**
 * Dispatches to whichever stack the site is on. LocalWP keeps returning a socket; agent-local
 * returns TCP details plus live credentials; `plain`/`mamp` report "not managed" and the run
 * proceeds on the site's stored transport.
 */
export async function ensureLocalSiteRunning(
  site: Pick<Site, 'path' | 'localStack'>,
  onStatus?: (message: string) => void
): Promise<LocalStackRunningOutcome> {
  const outcome = await providerFor(site.localStack).ensureRunning(
    { path: site.path, localStack: site.localStack },
    onStatus
  )
  return {
    ok: outcome.ok,
    socketPath: outcome.socketPath,
    message: outcome.message,
    port: outcome.port,
    user: outcome.user,
    password: outcome.password,
    database: outcome.database
  }
}

/**
 * Starts a stopped local site and adopts whichever transport the stack reports.
 *
 * LocalWP re-keys its socket directory per site id, so a stored socket goes stale after a Local
 * restart — reusing it is the most common cause of "Can't connect to local MySQL" straight after an
 * import begins. TCP stacks have the same problem in a different shape: agent-local hands out the
 * per-site password on demand and can re-provision a site behind Muster's back, so the credentials
 * ride the run config for this run only and are never written to the secret store.
 */
export async function startLocalStack(
  context: SiteRunContext,
  config: SiteRunConfig,
  ensure: (
    site: Pick<Site, 'path' | 'localStack'>,
    onStatus?: (message: string) => void
  ) => Promise<LocalStackRunningOutcome>
): Promise<SiteRunConfig> {
  const outcome = await ensure(config.site, context.status)
  if (!outcome.ok) {
    throw new SiteRunStepError(LOCAL_STACK_STEP, outcome.message)
  }
  if (outcome.socketPath) {
    if (outcome.socketPath === config.site.dbSocket) {
      return config
    }
    context.log(`Using local MySQL socket ${outcome.socketPath}`)
    return { ...config, site: { ...config.site, dbSocket: outcome.socketPath } }
  }
  if (!outcome.port && !outcome.user && !outcome.password) {
    return config
  }
  const site = { ...config.site, dbSocket: '' }
  if (outcome.port) {
    site.dbPort = outcome.port
  }
  if (outcome.user) {
    site.dbUser = outcome.user
  }
  context.log(`Using local MySQL 127.0.0.1:${site.dbPort ?? MYSQL_DEFAULT_PORT} as ${site.dbUser}`)
  return {
    ...config,
    site,
    dbPassword: outcome.password ?? config.dbPassword,
    localDatabaseName: outcome.database ?? config.localDatabaseName
  }
}
