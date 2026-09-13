// Starting and stopping a LocalWP site, ported from ocsites create_localwp.ensure_site_running /
// stop_site / wait_for_socket.
//
// The import pipeline calls ensureLocalWpSiteRunning before touching the local database, so it must
// be a cheap no-op when the site is already up, must never throw across a run, and must surface
// progress through a callback instead of printing.
//
// Error model: these functions return a structured outcome rather than throwing. Cancellation ends
// the wait loop and reports state 'failed'; the caller's own throwIfCancelled turns that into a
// real cancellation on the next stage boundary, so there is only one error channel here.

import path from 'node:path'
import { currentSocketIfRunning, findLocalWpSiteId, isLocalWpAppRunning } from './localwp-detection'
import {
  createLocalWpHost,
  isLocalWpSupported,
  LOCALWP_PROBE_TIMEOUT_MS,
  LOCALWP_UNSUPPORTED_PLATFORM,
  localWpSocketPath,
  localWpWordPressRoot,
  type LocalWpHost
} from './localwp-host'
import type { LocalWpControlOutcome } from '../../shared/site-stack-types'

export type { LocalWpControlOutcome }

/** Local's own start/stop can be slow on a cold service; ocsites used the same budgets. */
const DEFAULT_CLI_START_TIMEOUT_MS = 180_000
const DEFAULT_CLI_STOP_TIMEOUT_MS = 120_000
const DEFAULT_SOCKET_WAIT_MS = 180_000
const SOCKET_POLL_INTERVAL_MS = 2_000
const APP_LAUNCH_SETTLE_MS = 3_000
const STATUS_THROTTLE_MS = 5_000
const CLI_ERROR_DETAIL_LIMIT = 200

/**
 * How long to wait for Local to list a folder in its registry — **off by default**.
 *
 * Most callers must not wait: `siteStacks:start`/`stop` and the import pipeline answered instantly
 * before this existed and pass no domain or signal, and a stale record would otherwise stall them
 * for a minute to produce the same answer. Only the wizard's cert path, which runs seconds after
 * Local was told to create or register the site, opts in (registrationTimeoutMs).
 */
const DEFAULT_REGISTRATION_WAIT_MS = 0
const REGISTRATION_POLL_INTERVAL_MS = 1_000

export type LocalWpControlState = 'unsupported' | 'not-managed' | 'running' | 'stopped' | 'failed'

export type LocalWpControlOptions = {
  host?: LocalWpHost
  onStatus?: (message: string) => void
  signal?: AbortSignal
  cliTimeoutMs?: number
  socketTimeoutMs?: number
  /**
   * The domain Local serves this site on, when the caller knows it. Only used to name the site in
   * prose — a folder path reads as noise to the user this is written for.
   */
  domain?: string
  registrationTimeoutMs?: number
}

/**
 * Polls Local's registry until the site's MySQL socket exists AND mysqld accepts a connection.
 * Returns the socket path, or null on timeout or cancellation — never hangs.
 */
export async function waitForSocket(
  sitePath: string,
  options: LocalWpControlOptions = {}
): Promise<string | null> {
  const host = options.host ?? createLocalWpHost()
  if (!isLocalWpSupported(host)) {
    return null
  }
  const deadline = Date.now() + (options.socketTimeoutMs ?? DEFAULT_SOCKET_WAIT_MS)
  let lastStatusAt = 0
  while (Date.now() < deadline && options.signal?.aborted !== true) {
    const siteId = await findLocalWpSiteId(host, sitePath)
    const candidate = siteId ? localWpSocketPath(host, siteId) : ''
    const socketExists = candidate.length > 0 && (await host.pathExists(candidate))
    if (socketExists && (await host.isMysqlSocketReady(candidate, LOCALWP_PROBE_TIMEOUT_MS))) {
      return candidate
    }
    const now = Date.now()
    if (options.onStatus && now - lastStatusAt > STATUS_THROTTLE_MS) {
      lastStatusAt = now
      options.onStatus(waitingMessage(siteId !== null, socketExists, deadline - now))
    }
    await host.sleep(SOCKET_POLL_INTERVAL_MS)
  }
  return null
}

function waitingMessage(registered: boolean, socketExists: boolean, remainingMs: number): string {
  if (socketExists) {
    return 'MySQL socket present, waiting for the server to accept connections…'
  }
  if (registered) {
    return 'Site registered in LocalWP, waiting for the MySQL socket…'
  }
  return `Waiting for LocalWP to finish… (${Math.max(0, Math.round(remainingMs / 1000))}s remaining)`
}

function registrationWaitingMessage(domain: string): string {
  const site = domain.length > 0 ? domain : 'this site'
  return (
    `Waiting for LocalWP to finish setting up ${site}… ` +
    `If Local is asking for your password, answer it.`
  )
}

/**
 * A folder with nothing Local-shaped in it. Accurate and immediate: Local never touched this, so
 * there is no password prompt to answer and no retry worth pressing.
 */
const NOT_LOCALWP_SITE = 'Not a LocalWP site'

/**
 * A Local-shaped folder Local does not list. Two situations share that shape: a caller that *waited*
 * for Local to register it, and one that only looked once. The prompt advice belongs to the first —
 * a caller that never waited renders no "Change and retry" control, and Local's password prompt was
 * never why it asked.
 */
function notListedMessage(args: { waited: boolean; domain: string }): string {
  if (!args.waited) {
    return 'Not registered in the Local app'
  }
  const site = args.domain.length > 0 ? args.domain : 'this folder'
  return (
    `LocalWP never reported ${site} as one of its sites. ` +
    `If the Local app is showing a password prompt, answer it, ` +
    `then press "Change and retry".`
  )
}

/** Polls the registry until Local lists this folder, until `budgetMs` is spent, or on abort. */
async function awaitRegisteredSiteId(
  host: LocalWpHost,
  sitePath: string,
  options: LocalWpControlOptions,
  budgetMs: number
): Promise<string | null> {
  const deadline = Date.now() + budgetMs
  let lastStatusAt = 0
  for (;;) {
    const siteId = await findLocalWpSiteId(host, sitePath)
    if (siteId !== null || options.signal?.aborted === true || Date.now() >= deadline) {
      return siteId
    }
    const now = Date.now()
    if (options.onStatus && now - lastStatusAt > STATUS_THROTTLE_MS) {
      lastStatusAt = now
      options.onStatus(registrationWaitingMessage(options.domain ?? ''))
    }
    await host.sleep(REGISTRATION_POLL_INTERVAL_MS)
  }
}

/**
 * Whether Local is responsible for this folder, and — when it is not — which of the two very
 * different reasons applies. Collapsing them is what told users to answer a password prompt for a
 * folder Local had never seen.
 */
type LocalWpOwnership =
  | { kind: 'registered'; siteId: string }
  /** Nothing Local-shaped here: Local could not own it, and no wait was spent finding that out. */
  | { kind: 'not-local' }
  /**
   * Local-shaped and not listed. `waited` records which of the two that was: a caller that spent a
   * registration budget, or one that looked once because it never asked for a wait.
   */
  | { kind: 'not-listed'; waited: boolean }
  | { kind: 'cancelled' }

/**
 * The pre-check both control functions share: is Local responsible for this folder?
 *
 * Local's registry is the authority; a `wp-config.php` under app/public only says WordPress was
 * installed there. Asking once and reading null as "not LocalWP" is what turned a site Local had
 * just *created* — which has no core yet, because create mode never installs one — into an instant,
 * wrong failure. So a folder Local has not listed yet reads as "still waiting" until its budget
 * runs out, and only for a caller that asked for one (see DEFAULT_REGISTRATION_WAIT_MS).
 */
async function resolveLocalWpOwnership(
  host: LocalWpHost,
  sitePath: string,
  options: LocalWpControlOptions
): Promise<LocalWpOwnership> {
  const listed = await findLocalWpSiteId(host, sitePath)
  if (listed !== null) {
    return { kind: 'registered', siteId: listed }
  }
  const shaped =
    (await hasLocalWpLayout(host, sitePath)) ||
    (await host.pathExists(localWpWordPressRoot(sitePath)))
  if (!shaped) {
    return { kind: 'not-local' }
  }
  const budgetMs = options.registrationTimeoutMs ?? DEFAULT_REGISTRATION_WAIT_MS
  const siteId = await awaitRegisteredSiteId(host, sitePath, options, budgetMs)
  if (siteId !== null) {
    return { kind: 'registered', siteId }
  }
  if (options.signal?.aborted === true) {
    return { kind: 'cancelled' }
  }
  return { kind: 'not-listed', waited: budgetMs > 0 }
}

/** The layout marker: does this folder hold a WordPress install under app/public? */
async function hasLocalWpLayout(host: LocalWpHost, sitePath: string): Promise<boolean> {
  return host.pathExists(path.join(localWpWordPressRoot(sitePath), 'wp-config.php'))
}

/**
 * The outcome `ensureSiteRunning` and `stopSite` both return for every ownership result but
 * `registered`. One place decides it, so the two surfaces cannot drift into telling the user
 * different things about the same folder.
 */
function ownershipRefusal(
  ownership: Exclude<LocalWpOwnership, { kind: 'registered' }>,
  domain: string
): LocalWpControlOutcome {
  if (ownership.kind === 'cancelled') {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message: 'Cancelled while waiting for LocalWP to register the site.'
    }
  }
  if (ownership.kind === 'not-local') {
    return skip('not-managed', NOT_LOCALWP_SITE)
  }
  return skip('not-managed', notListedMessage({ waited: ownership.waited, domain }))
}

/**
 * Brings the LocalWP site at sitePath up if it is stopped.
 *
 * - `state: 'running'` — already up, or just started; `socketPath` is the live socket.
 * - `state: 'not-managed'` / `'unsupported'` — nothing to do, `ok: true`; proceed on TCP.
 * - `state: 'failed'` — the site IS LocalWP-managed but could not be started.
 */
export async function ensureSiteRunning(
  sitePath: string,
  options: LocalWpControlOptions = {}
): Promise<LocalWpControlOutcome> {
  const host = options.host ?? createLocalWpHost()
  if (!isLocalWpSupported(host)) {
    return skip('unsupported', LOCALWP_UNSUPPORTED_PLATFORM)
  }
  const ownership = await resolveLocalWpOwnership(host, sitePath, options)
  if (ownership.kind !== 'registered') {
    return ownershipRefusal(ownership, options.domain ?? '')
  }
  const existing = await currentSocketIfRunning(host, sitePath)
  if (existing) {
    return {
      ok: true,
      socketPath: existing,
      message: 'LocalWP site already running',
      state: 'running'
    }
  }
  const siteId = ownership.siteId
  // Local's per-site services only start while the app itself is running.
  if (!(await isLocalWpAppRunning(host))) {
    options.onStatus?.('Local app is not running — launching it…')
    await host.run('open', ['-ga', 'Local'], { timeoutMs: 15_000, signal: options.signal })
    await host.sleep(APP_LAUNCH_SETTLE_MS)
  }
  const cli = await resolveLocalCli(host)
  if (!cli) {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message:
        'LocalWP site is stopped and `local-cli` was not found to start it. Start the site in the Local app, then retry.'
    }
  }
  options.onStatus?.(`LocalWP site is stopped — starting it (id: ${siteId})…`)
  const started = await host.run(cli, ['start-site', siteId], {
    timeoutMs: options.cliTimeoutMs ?? DEFAULT_CLI_START_TIMEOUT_MS,
    signal: options.signal
  })
  if (started.code !== 0) {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message: `\`local-cli start-site\` failed: ${cliErrorDetail(started.stderr, started.stdout)}`
    }
  }
  options.onStatus?.('Waiting for MySQL to accept connections…')
  const socketPath = await waitForSocket(sitePath, { ...options, host })
  if (!socketPath) {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message:
        options.signal?.aborted === true
          ? 'Cancelled while waiting for the LocalWP MySQL socket.'
          : 'Timed out waiting for the LocalWP MySQL socket after starting the site.'
    }
  }
  return { ok: true, socketPath, message: 'LocalWP site started', state: 'running' }
}

/**
 * The canonical entry point for the import pipeline. An empty socketPath means "not LocalWP, carry
 * on"; the returned socket must override the stored `site.dbSocket` for the rest of the run,
 * because Local re-keys the socket directory per site id and a stale stored path is the usual cause
 * of "Can't connect to local MySQL" right after a Local restart.
 */
export async function ensureLocalWpSiteRunning(
  sitePath: string,
  onStatus?: (message: string) => void
): Promise<{ ok: boolean; socketPath: string; message: string }> {
  return ensureSiteRunning(sitePath, { onStatus })
}

export async function stopSite(
  sitePath: string,
  options: LocalWpControlOptions = {}
): Promise<LocalWpControlOutcome> {
  const host = options.host ?? createLocalWpHost()
  if (!isLocalWpSupported(host)) {
    return skip('unsupported', LOCALWP_UNSUPPORTED_PLATFORM)
  }
  const ownership = await resolveLocalWpOwnership(host, sitePath, options)
  if (ownership.kind !== 'registered') {
    return ownershipRefusal(ownership, options.domain ?? '')
  }
  const siteId = ownership.siteId
  if ((await currentSocketIfRunning(host, sitePath)) === null) {
    return skip('stopped', 'Already stopped')
  }
  const cli = await resolveLocalCli(host)
  if (!cli) {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message: '`local-cli` not found to stop the site.'
    }
  }
  options.onStatus?.(`Stopping LocalWP site (id: ${siteId})…`)
  const stopped = await host.run(cli, ['stop-site', siteId], {
    timeoutMs: options.cliTimeoutMs ?? DEFAULT_CLI_STOP_TIMEOUT_MS,
    signal: options.signal
  })
  if (stopped.code !== 0) {
    return {
      ok: false,
      socketPath: '',
      state: 'failed',
      message: `\`local-cli stop-site\` failed: ${cliErrorDetail(stopped.stderr, stopped.stdout)}`
    }
  }
  return skip('stopped', 'Stopped')
}

/** Locates Local's `local-cli`, which npm usually installs under an nvm-managed node. */
export async function resolveLocalCli(host: LocalWpHost): Promise<string | null> {
  const onPath = await host.run('which', ['local-cli'])
  const resolved = onPath.code === 0 ? onPath.stdout.trim().split('\n')[0]?.trim() : ''
  if (resolved) {
    return resolved
  }
  const nvmRoot = path.join(host.homeDir, '.nvm', 'versions', 'node')
  const nvmVersions = (await host.listDirectory(nvmRoot)).sort().toReversed()
  const candidates = [
    ...nvmVersions.map((version) => path.join(nvmRoot, version, 'bin', 'local-cli')),
    '/opt/homebrew/bin/local-cli',
    '/usr/local/bin/local-cli',
    path.join(host.homeDir, '.npm-global', 'bin', 'local-cli'),
    path.join(host.homeDir, '.local', 'bin', 'local-cli')
  ]
  for (const candidate of candidates) {
    if (await host.pathExists(candidate)) {
      return candidate
    }
  }
  return null
}

function skip(state: LocalWpControlState, message: string): LocalWpControlOutcome {
  return { ok: true, socketPath: '', message, state }
}

function cliErrorDetail(stderr: string, stdout: string): string {
  return (stderr.trim() || stdout.trim()).slice(0, CLI_ERROR_DETAIL_LIMIT)
}
