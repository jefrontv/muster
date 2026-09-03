// agent-local's implementation of LocalStackProvider: resolve a Muster site path to an agent-local
// slug, start/stop it, and report the live database transport.
//
// Two shapes differ from LocalWP and drive everything here:
//
// 1. agent-local serves one shared MariaDB on a fixed TCP port with a per-site schema and user,
//    where LocalWP runs a per-site mysqld on a Unix socket. `socketPath` is therefore ALWAYS '' —
//    buildLocalMysqlConnectionOptions selects its TCP branch precisely by an empty socket, so a
//    placeholder path there would silently route every connection at a socket that does not exist.
//
// 2. agent-local keys sites by slug and by docroot. Muster keys them by repo root, which sits above
//    the docroot (…/site vs …/site/app/public), and `GET /resolve` only matches a path at or below
//    the site's work_dir — a repo root 404s. resolveAgentLocalSite therefore matches downwards from
//    the site path over `GET /sites`. See resolveAgentLocalSite for the ordering.

import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import { agentLocalCertStatus, agentLocalCertTrust } from './agent-local-cert'
import {
  AGENT_LOCAL_DATABASE_PORT,
  AGENT_LOCAL_READ_TIMEOUT_MS,
  AGENT_LOCAL_START_TIMEOUT_MS,
  AGENT_LOCAL_UNSUPPORTED_PLATFORM,
  createAgentLocalHost,
  describeAgentLocalResponse,
  isAgentLocalDaemonDown,
  isAgentLocalSupported,
  requestWithDaemon,
  type AgentLocalHost,
  type AgentLocalResponse
} from './agent-local-host'
import { resolveAgentLocalSite } from './agent-local-site-resolve'
import {
  localStackSkip,
  registerLocalStackProvider,
  type LocalStackCredentials,
  type LocalStackOutcome,
  type LocalStackProvider,
  type LocalStackSiteRef
} from './local-stack-provider'

export type { AgentLocalSiteMatch } from './agent-local-site-resolve'
export { resolveAgentLocalSite }

export const AGENT_LOCAL_NOT_MANAGED = 'Not an Agent Local site'
export const AGENT_LOCAL_DAEMON_UNREACHABLE =
  'Agent Local is installed but its daemon is not answering. Run `agent-local doctor`.'

type AgentLocalOptions = { host?: AgentLocalHost }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Reads connection details from either shape the daemon uses.
 *
 * `/resolve` and `/sites/{slug}/start` nest them under `db` as `{name, user, pass}`;
 * `POST /sites/{slug}/db` returns them flat as `{database, user, password}`. Accepting only the
 * first is a silent failure: `password` reads as empty, the caller falls back to whatever is in the
 * secret store, and MariaDB answers "Access denied ... (using password: YES)" — which looks like a
 * wrong stored credential rather than a parsing bug.
 */
function credentialsFromPayload(data: unknown): LocalStackCredentials | null {
  const payload = asRecord(data)
  const db = asRecord(payload?.db) ?? payload
  if (!db) {
    return null
  }
  const user = readString(db, 'user')
  if (user.length === 0) {
    return null
  }
  const port = typeof db.port === 'number' ? db.port : AGENT_LOCAL_DATABASE_PORT
  return {
    // Always empty: see the header note on the TCP branch.
    socketPath: '',
    port,
    user,
    password: readString(db, 'pass') || readString(db, 'password'),
    database: readString(db, 'name') || readString(db, 'database')
  }
}

function unavailableOutcome(response: AgentLocalResponse): LocalStackOutcome {
  return {
    ok: false,
    socketPath: '',
    state: 'failed',
    message: isAgentLocalDaemonDown(response)
      ? AGENT_LOCAL_DAEMON_UNREACHABLE
      : describeAgentLocalResponse(response)
  }
}

export async function ensureAgentLocalSiteRunning(
  site: LocalStackSiteRef,
  onStatus?: (message: string) => void,
  options: AgentLocalOptions = {}
): Promise<LocalStackOutcome> {
  const host = options.host ?? createAgentLocalHost()
  if (!isAgentLocalSupported(host)) {
    return localStackSkip('unsupported', AGENT_LOCAL_UNSUPPORTED_PLATFORM)
  }
  const { match, response } = await resolveAgentLocalSite(site, { host })
  if (!match) {
    return response.ok || response.status === 404
      ? localStackSkip('not-managed', AGENT_LOCAL_NOT_MANAGED)
      : unavailableOutcome(response)
  }
  onStatus?.(`Starting Agent Local site '${match.slug}'…`)
  // Idempotent by design: start on a running site returns the same payload rather than an error.
  const started = await requestWithDaemon(host, 'POST', `/sites/${match.slug}/start`, undefined, {
    timeoutMs: AGENT_LOCAL_START_TIMEOUT_MS
  })
  if (!started.ok) {
    return unavailableOutcome(started)
  }
  const credentials = credentialsFromPayload(started.data)
  const payload = asRecord(started.data)
  return {
    ok: true,
    socketPath: '',
    state: 'running',
    message: `Agent Local site '${match.slug}' is running`,
    port: credentials?.port ?? AGENT_LOCAL_DATABASE_PORT,
    user: credentials?.user,
    password: credentials?.password,
    database: credentials?.database,
    wpDir: readString(payload, 'wp_dir') || match.wpDir
  }
}

export async function stopAgentLocalSite(
  site: LocalStackSiteRef,
  options: AgentLocalOptions = {}
): Promise<LocalStackOutcome> {
  const host = options.host ?? createAgentLocalHost()
  if (!isAgentLocalSupported(host)) {
    return localStackSkip('unsupported', AGENT_LOCAL_UNSUPPORTED_PLATFORM)
  }
  const { match, response } = await resolveAgentLocalSite(site, { host })
  if (!match) {
    return response.ok || response.status === 404
      ? localStackSkip('not-managed', AGENT_LOCAL_NOT_MANAGED)
      : unavailableOutcome(response)
  }
  const stopped = await requestWithDaemon(host, 'POST', `/sites/${match.slug}/stop`)
  if (!stopped.ok) {
    return unavailableOutcome(stopped)
  }
  return {
    ok: true,
    socketPath: '',
    state: 'stopped',
    message: `Agent Local site '${match.slug}' stopped`
  }
}

/**
 * Renames an already-registered site's local domain. Hosts entry and certificate follow.
 *
 * Why this exists rather than re-running the migration: attach refuses a folder agent-local
 * already serves, so a user who typed a new domain into setup had it silently ignored. This is the
 * only route that moves an existing site, and it is a no-op the daemon rejects for an unmanaged
 * folder — so "not managed" is reported, never guessed at by creating a second site.
 */
export async function setAgentLocalSiteDomain(
  site: LocalStackSiteRef,
  domain: string,
  options: AgentLocalOptions = {}
): Promise<LocalStackOutcome> {
  const host = options.host ?? createAgentLocalHost()
  if (!isAgentLocalSupported(host)) {
    return localStackSkip('unsupported', AGENT_LOCAL_UNSUPPORTED_PLATFORM)
  }
  const wanted = domain.trim()
  if (wanted.length === 0) {
    return localStackSkip('not-managed', 'A new domain is required.')
  }
  const { match, response } = await resolveAgentLocalSite(site, { host })
  if (!match) {
    return response.ok || response.status === 404
      ? localStackSkip('not-managed', AGENT_LOCAL_NOT_MANAGED)
      : unavailableOutcome(response)
  }
  if (match.domain === wanted) {
    // Already there. Reporting success keeps the caller's "make it so" intent idempotent.
    return {
      ok: true,
      socketPath: '',
      state: match.running ? 'running' : 'stopped',
      message: `Agent Local site '${match.slug}' already serves ${wanted}`
    }
  }
  const renamed = await requestWithDaemon(host, 'POST', `/sites/${match.slug}/domain`, {
    domain: wanted
  })
  if (!renamed.ok) {
    return unavailableOutcome(renamed)
  }
  return {
    ok: true,
    socketPath: '',
    state: match.running ? 'running' : 'stopped',
    message: `Agent Local site '${match.slug}' now serves ${wanted}`
  }
}

/**
 * Live credentials, fetched rather than stored: agent-local hands them out on demand, so a copy in
 * Muster's secret store would only be a staleness bug waiting for the site to be re-provisioned.
 */
export async function agentLocalCredentials(
  site: LocalStackSiteRef,
  options: AgentLocalOptions = {}
): Promise<LocalStackCredentials | null> {
  const host = options.host ?? createAgentLocalHost()
  if (!isAgentLocalSupported(host)) {
    return null
  }
  const { match } = await resolveAgentLocalSite(site, { host })
  if (!match) {
    return null
  }
  // POST /sites/{slug}/db starts MariaDB if it is down, so this doubles as "make the DB reachable".
  const response = await requestWithDaemon(host, 'POST', `/sites/${match.slug}/db`, undefined, {
    timeoutMs: AGENT_LOCAL_START_TIMEOUT_MS
  })
  if (!response.ok) {
    return null
  }
  return credentialsFromPayload(response.data)
}

export async function detectAgentLocalStack(
  sitePath: string,
  options: AgentLocalOptions = {}
): Promise<LocalWpStackDetection> {
  const host = options.host ?? createAgentLocalHost()
  const absent: LocalWpStackDetection = {
    supported: isAgentLocalSupported(host),
    reason: isAgentLocalSupported(host) ? '' : AGENT_LOCAL_UNSUPPORTED_PLATFORM,
    stack: 'plain',
    appRunning: false,
    registered: false,
    siteId: '',
    domain: '',
    socketPath: '',
    socketReady: false,
    phpVersion: ''
  }
  if (!isAgentLocalSupported(host)) {
    return absent
  }
  const status = await requestWithDaemon(host, 'GET', '/status', undefined, {
    timeoutMs: AGENT_LOCAL_READ_TIMEOUT_MS
  })
  if (!status.ok) {
    // Honest degradation: unreachable is reported, not thrown, and never claims "not a site".
    return {
      ...absent,
      reason: isAgentLocalDaemonDown(status) ? AGENT_LOCAL_DAEMON_UNREACHABLE : ''
    }
  }
  const { match } = await resolveAgentLocalSite(
    { path: sitePath, localStack: 'agent-local' },
    {
      host
    }
  )
  if (!match) {
    return { ...absent, appRunning: true }
  }
  return {
    supported: true,
    reason: '',
    stack: 'agent-local',
    appRunning: true,
    registered: true,
    siteId: match.slug,
    domain: match.domain,
    // Always TCP; socketReady mirrors "the site is up" so callers reading it stay meaningful.
    socketPath: '',
    socketReady: match.running,
    phpVersion: match.phpVersion
  }
}

/**
 * Stands the front router off :80/:443 so LocalWP can bind them; sites stay reachable on
 * agent-local's own front ports meanwhile, and the router reclaims automatically.
 *
 * Probes rather than spawns — `host.request`, not `requestWithDaemon`. A daemon that is not running
 * is not holding the ports, so booting one just to tell it to stand aside would be the opposite of
 * what the caller wants. Same reasoning for the `/yield` route being absent on older builds: that
 * daemon holds the ports and will not let go, and the caller proceeds either way.
 */
export async function releaseAgentLocalPrivilegedPorts(
  seconds: number,
  options: AgentLocalOptions = {}
): Promise<boolean> {
  const host = options.host ?? createAgentLocalHost()
  if (!isAgentLocalSupported(host)) {
    return false
  }
  const response = await host.request('POST', '/yield', { seconds })
  // Daemon down means nothing of ours is on those ports, which is what the caller is asking about.
  return response.ok || isAgentLocalDaemonDown(response)
}

export const agentLocalProvider: LocalStackProvider = {
  id: 'agent-local',
  isAvailable: async () => {
    const host = createAgentLocalHost()
    if (!isAgentLocalSupported(host)) {
      return false
    }
    // Binary present AND answering: a token file alone proves only that it once ran.
    const status = await requestWithDaemon(host, 'GET', '/status')
    return status.ok
  },
  detect: (sitePath) => detectAgentLocalStack(sitePath),
  ensureRunning: (site, onStatus) => ensureAgentLocalSiteRunning(site, onStatus),
  stop: (site) => stopAgentLocalSite(site),
  credentials: (site) => agentLocalCredentials(site),
  certStatus: (domain) => agentLocalCertStatus(domain),
  certTrust: (domain) => agentLocalCertTrust(domain),
  certEnsure: (domain) => agentLocalCertTrust(domain),
  releasePrivilegedPorts: (seconds) => releaseAgentLocalPrivilegedPorts(seconds)
}

registerLocalStackProvider(agentLocalProvider)
