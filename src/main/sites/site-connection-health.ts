// End-to-end connectivity probe for one environment: SSH, the remote WordPress root, the remote
// database, disk headroom, and the local database — plus, for the health variant, the live site.
//
// Ported from ocsites `_test_connection_impl` (mcp_server.py:1232) and `_check_health_impl` (:1346),
// which were one function and its superset. Two changes worth knowing:
//
//   * A failure is classified. ocsites returned a flat list of checks with free-text details, so a
//     caller could not tell a wrong password from an unreachable host from a mistyped root path —
//     three failures with three completely different fixes. `failure` names the first one.
//   * The remote `SELECT 1` authenticates through a 0600 option file instead of `--password=` in
//     argv. On a shared host the process table belongs to everyone.

import type {
  SiteCheck,
  SiteCheckName,
  SiteConnectionFailure,
  SiteConnectionReport
} from '../../shared/site-tool-types'
import { checkLocalMysqlConnection } from './local-mysql-connection'
import { redactPassword, renderMysqlOptionFile } from './mysql-binary'
import { quoteShellArgument, type SiteRunConfig, type SiteSshSession } from './pipeline-contract'
import { normalizeLiveSiteUrl, probeLiveSite, probeTlsCertificate } from './site-http-probe'
import { readRemoteDbCredentials, type RemoteDbCredentials } from './wp-config-reader'

const PROBE_TIMEOUT_MS = 15_000
const REMOTE_OPTION_FILENAME = '.muster-healthcheck.cnf'
/** Above this, the server is close enough to full that the next deploy is at risk. */
const DISK_FULL_PERCENT = 95

/** First failed check wins; ssh-connect is refined into auth vs unreachable by the caller. */
const FAILURE_BY_CHECK: Record<SiteCheckName, SiteConnectionFailure> = {
  'ssh-connect': 'unreachable',
  'wp-config-readable': 'wrong-path',
  'remote-db-credentials': 'remote-database',
  'remote-db-ping': 'remote-database',
  'disk-space': 'disk-space',
  'local-db-login': 'local-database',
  'http-reachable': 'live-site',
  'tls-certificate': 'live-site'
}

/** Opened inside the probe so a connect failure can be classified rather than thrown. */
export type SiteSessionFactory = () => Promise<SiteSshSession>

export type SiteConnectionRequest = {
  config: SiteRunConfig
  openSession: SiteSessionFactory
  /** Adds the live-site HTTP and TLS checks — the difference between test_connection and health. */
  includeLiveSite: boolean
  /** Injected for tests; defaults to a real local MySQL connect. */
  checkLocalDatabase?: (config: SiteRunConfig) => Promise<void>
  signal?: AbortSignal
}

export async function checkSiteConnection(
  request: SiteConnectionRequest
): Promise<SiteConnectionReport> {
  const { config } = request
  const checks: SiteCheck[] = []
  const { hostname, username } = config.environment
  if (hostname.trim().length === 0 || username.trim().length === 0) {
    checks.push({
      check: 'ssh-connect',
      outcome: 'failed',
      detail: `Environment "${config.environmentName}" has no SSH hostname or username.`
    })
    return report(config.environmentName, checks, 'missing-credentials')
  }

  let session: SiteSshSession
  try {
    session = await request.openSession()
    checks.push({
      check: 'ssh-connect',
      outcome: 'ok',
      detail: `Connected to ${username}@${hostname}`
    })
  } catch (error) {
    const detail = redactPassword(
      error instanceof Error ? error.message : String(error),
      config.sshPassword
    )
    checks.push({ check: 'ssh-connect', outcome: 'failed', detail })
    return report(config.environmentName, checks, classifySshFailure(detail))
  }

  try {
    await runRemoteChecks(session, config, checks)
  } finally {
    await session.close().catch(() => undefined)
  }

  checks.push(await checkLocalDatabase(config, request.checkLocalDatabase))
  if (request.includeLiveSite) {
    const url = normalizeLiveSiteUrl(
      config.environment.liveDomain,
      config.environment.liveDomainProtocol
    )
    checks.push(await probeLiveSite(url, request.signal))
    checks.push(await probeTlsCertificate(url, request.signal))
  }
  return report(config.environmentName, checks, null)
}

/**
 * ssh2 reports a rejected credential and an unreachable host through the same Error type, so the
 * message is the only signal available. Getting this wrong sends the user to fix the wrong thing.
 */
export function classifySshFailure(detail: string): SiteConnectionFailure {
  return /authenticat|permission denied|password|publickey|keyboard-interactive/i.test(detail)
    ? 'auth'
    : 'unreachable'
}

async function runRemoteChecks(
  session: SiteSshSession,
  config: SiteRunConfig,
  checks: SiteCheck[]
): Promise<void> {
  const root = config.environment.rootPath.replace(/\/+$/, '') || '.'
  const configPath = `${root}/wp-config.php`
  const readable = await session.exec(`test -r ${quoteShellArgument(configPath)}`, {
    timeoutMs: PROBE_TIMEOUT_MS
  })
  if (readable.code !== 0) {
    checks.push({
      check: 'wp-config-readable',
      outcome: 'failed',
      detail: `wp-config.php is not readable at ${configPath} — check the environment's root path.`
    })
  } else {
    checks.push({ check: 'wp-config-readable', outcome: 'ok', detail: configPath })
    await checkRemoteDatabase(session, root, checks)
  }
  checks.push(await checkDiskSpace(session, root))
}

async function checkRemoteDatabase(
  session: SiteSshSession,
  root: string,
  checks: SiteCheck[]
): Promise<void> {
  let credentials: RemoteDbCredentials
  try {
    credentials = await readRemoteDbCredentials(session, root)
  } catch (error) {
    checks.push({
      check: 'remote-db-credentials',
      outcome: 'failed',
      detail: `Could not parse wp-config.php: ${error instanceof Error ? error.message : String(error)}`
    })
    return
  }
  if (credentials.name.length === 0 || credentials.user.length === 0) {
    checks.push({
      check: 'remote-db-credentials',
      outcome: 'failed',
      detail: 'DB_NAME or DB_USER is missing from the remote wp-config.php.'
    })
    return
  }
  checks.push({
    check: 'remote-db-credentials',
    outcome: 'ok',
    // The password is deliberately absent: this string reaches the renderer.
    detail: `DB=${credentials.name} user=${credentials.user}`
  })

  const optionFile = `${root}/${REMOTE_OPTION_FILENAME}`
  let pinged: { code: number; stdout: string; stderr: string }
  try {
    await session.writeSecureRemoteFile(
      optionFile,
      renderMysqlOptionFile({ user: credentials.user, password: credentials.password })
    )
    pinged = await session.exec(
      `mysql --defaults-extra-file=${quoteShellArgument(optionFile)} ` +
        `--database=${quoteShellArgument(credentials.name)} --batch --skip-column-names ` +
        `-e ${quoteShellArgument('SELECT 1;')}`,
      { timeoutMs: PROBE_TIMEOUT_MS }
    )
  } catch (error) {
    const detail = redactPassword(
      error instanceof Error ? error.message : String(error),
      credentials.password
    )
    checks.push({ check: 'remote-db-ping', outcome: 'failed', detail })
    return
  } finally {
    await session.removeRemoteFile(optionFile)
  }
  const failure = redactPassword(
    pinged.stderr.trim() || pinged.stdout.trim() || `mysql exited ${pinged.code}`,
    credentials.password
  )
  checks.push(
    pinged.code === 0 && pinged.stdout.includes('1')
      ? { check: 'remote-db-ping', outcome: 'ok', detail: 'SELECT 1 succeeded' }
      : { check: 'remote-db-ping', outcome: 'failed', detail: failure.slice(0, 300) }
  )
}

async function checkDiskSpace(session: SiteSshSession, root: string): Promise<SiteCheck> {
  const result = await session.exec(`df -P ${quoteShellArgument(root)} | tail -1`, {
    timeoutMs: PROBE_TIMEOUT_MS
  })
  const columns = result.stdout.trim().split(/\s+/)
  const usedPercent = Number.parseInt(columns[4]?.replace('%', '') ?? '', 10)
  if (result.code !== 0 || !Number.isFinite(usedPercent)) {
    return {
      check: 'disk-space',
      outcome: 'skipped',
      detail: result.stdout.trim() || 'df reported nothing usable.'
    }
  }
  return {
    check: 'disk-space',
    outcome: usedPercent < DISK_FULL_PERCENT ? 'ok' : 'failed',
    detail: `${usedPercent}% used at ${columns[5] ?? root}`
  }
}

async function checkLocalDatabase(
  config: SiteRunConfig,
  probe: ((config: SiteRunConfig) => Promise<void>) | undefined
): Promise<SiteCheck> {
  try {
    await (probe ?? checkLocalMysqlConnection)(config)
    return {
      check: 'local-db-login',
      outcome: 'ok',
      detail: `${config.site.dbSocket || '127.0.0.1'}, user: ${config.site.dbUser}`
    }
  } catch (error) {
    const detail = redactPassword(
      error instanceof Error ? error.message : String(error),
      config.dbPassword
    )
    return { check: 'local-db-login', outcome: 'failed', detail: detail.slice(0, 300) }
  }
}

function report(
  environment: string,
  checks: SiteCheck[],
  earlyFailure: SiteConnectionFailure | null
): SiteConnectionReport {
  const failed = checks.filter((check) => check.outcome === 'failed')
  return {
    environment,
    ok: failed.length === 0,
    checks,
    failedCount: failed.length,
    failure: earlyFailure ?? (failed[0] ? FAILURE_BY_CHECK[failed[0].check] : null)
  }
}
