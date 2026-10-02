// DDEV's implementation of LocalStackProvider.
//
// DDEV keys a project by the folder holding `.ddev/`, which is the repo root Muster stores, so no
// slug lookup is needed: `ddev describe` run in that folder answers for it. The database is TCP on
// a port Docker publishes per start, so credentials are read live and never stored.

import path from 'node:path'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import { ddevCertStatus, ddevCertTrust } from './ddev-cert'
import { ensureDockerRunning, isDockerRunning } from './ddev-docker'
import {
  createDdevHost,
  DDEV_NOT_INSTALLED,
  DDEV_START_TIMEOUT_MS,
  ddevOutputSummary,
  runDdevJson,
  type DdevHost
} from './ddev-host'
import { ddevCommandFailure } from './ddev-command-failure'
import {
  locateDdevProjectRoot,
  readDdevGlobalConfig,
  readDdevProjectConfig,
  type DdevProjectConfig
} from './ddev-project-files'
import {
  describeDdevProject,
  privilegedRouterPortMessage,
  routerHttpsPort,
  urlAuthority,
  type DdevProjectState
} from './ddev-project-state'
import {
  localStackSkip,
  registerLocalStackProvider,
  type LocalStackCredentials,
  type LocalStackOutcome,
  type LocalStackProvider,
  type LocalStackSiteRef
} from './local-stack-provider'

export const DDEV_NOT_MANAGED = 'Not a DDEV project (no .ddev/config.yaml).'

type DdevOptions = { host?: DdevHost }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function absentDetection(): LocalWpStackDetection {
  return {
    supported: true,
    reason: '',
    stack: 'plain',
    appRunning: false,
    registered: false,
    siteId: '',
    domain: '',
    socketPath: '',
    socketReady: false,
    phpVersion: ''
  }
}

/** The URL DDEV will serve on, computed from config when Docker is down and describe cannot run. */
async function configuredAuthority(host: DdevHost, config: DdevProjectConfig): Promise<string> {
  const global = await readDdevGlobalConfig(host)
  const port = global.routerHttpsPort === '443' ? '' : `:${global.routerHttpsPort}`
  return `${config.name}.${global.projectTld}${port}`
}

export async function findDdevProject(
  sitePath: string,
  options: DdevOptions = {}
): Promise<DdevProjectConfig | null> {
  const host = options.host ?? createDdevHost()
  const root = await locateDdevProjectRoot(host, sitePath)
  return root ? readDdevProjectConfig(host, root) : null
}

export async function detectDdevStack(
  sitePath: string,
  options: DdevOptions = {}
): Promise<LocalWpStackDetection> {
  const host = options.host ?? createDdevHost()
  const config = await findDdevProject(sitePath, { host })
  if (!config) {
    return absentDetection()
  }
  const docroot = path
    .relative(sitePath, path.join(config.root, config.docroot))
    .split(path.sep)
    .join('/')
  const authority = await configuredAuthority(host, config)
  const base: LocalWpStackDetection = {
    ...absentDetection(),
    stack: 'ddev',
    registered: true,
    siteId: config.name,
    domain: authority,
    phpVersion: config.phpVersion,
    url: `https://${authority}`,
    docroot,
    databaseName: 'db'
  }
  // Reported as DDEV so it is never mistaken for an unmanaged folder, but not one Muster can run.
  if (config.type && config.type !== 'wordpress') {
    return {
      ...base,
      supported: false,
      reason: `This DDEV project is type "${config.type}"; Muster only runs WordPress projects.`
    }
  }
  if (!host.findBinary('ddev')) {
    return { ...base, providerNote: 'DDEV is not installed.' }
  }
  // appRunning false on a DDEV answer means Docker is down; the card offers to start it.
  if (!(await isDockerRunning(host))) {
    return { ...base, providerNote: "Docker isn't running." }
  }
  try {
    const state = await describeDdevProject(host, config.root)
    const live = urlAuthority(state.primaryUrl)
    return {
      ...base,
      appRunning: true,
      domain: live || base.domain,
      url: state.primaryUrl || base.url,
      socketReady: state.status === 'running',
      phpVersion: state.phpVersion || base.phpVersion,
      ...(state.db
        ? { databaseHost: '127.0.0.1', databasePort: state.db.port, databaseName: state.db.name }
        : {})
    }
  } catch {
    // Docker up but DDEV refused (unknown project, broken config): the file answer still stands.
    return { ...base, appRunning: true }
  }
}

function runningOutcome(
  state: DdevProjectState,
  config: DdevProjectConfig,
  started: boolean
): LocalStackOutcome {
  const authority = urlAuthority(state.primaryUrl)
  return {
    ok: true,
    socketPath: '',
    state: started ? 'started' : 'running',
    message: started
      ? `Started ${config.name} on https://${authority}.`
      : `${config.name} is running on https://${authority}.`,
    ...(state.db
      ? {
          port: state.db.port,
          user: state.db.user,
          password: state.db.password,
          database: state.db.name
        }
      : {})
  }
}

function failedOutcome(message: string): LocalStackOutcome {
  return { ok: false, socketPath: '', state: 'failed', message }
}

export async function ensureDdevSiteRunning(
  site: LocalStackSiteRef,
  onStatus?: (message: string) => void,
  options: DdevOptions = {}
): Promise<LocalStackOutcome> {
  const host = options.host ?? createDdevHost()
  const config = await findDdevProject(site.path, { host })
  if (!config) {
    return localStackSkip('not-managed', DDEV_NOT_MANAGED)
  }
  const ddev = host.findBinary('ddev')
  if (!ddev) {
    return failedOutcome(DDEV_NOT_INSTALLED)
  }
  const dockerProblem = await ensureDockerRunning(host, onStatus)
  if (dockerProblem) {
    return failedOutcome(dockerProblem)
  }
  try {
    const before = await describeDdevProject(host, config.root)
    if (before.status === 'running') {
      return runningOutcome(before, config, false)
    }
  } catch {
    // An unregistered project fails describe until its first start; start is what fixes that.
  }
  onStatus?.(`Starting ${config.name} with DDEV…`)
  const result = await host.run(ddev, ['start'], {
    cwd: config.root,
    timeoutMs: DDEV_START_TIMEOUT_MS,
    onLine: (line) => onStatus?.(line)
  })
  try {
    const after = await describeDdevProject(host, config.root)
    if (after.status === 'running') {
      const port = routerHttpsPort(after.primaryUrl)
      if (!(await host.canConnect('127.0.0.1', port))) {
        return failedOutcome(privilegedRouterPortMessage(port))
      }
      return runningOutcome(after, config, true)
    }
    return failedOutcome(
      result.code === 0
        ? `DDEV reports ${config.name} as ${after.status || 'not running'} after start.`
        : ddevStartFailure(result)
    )
  } catch (error) {
    return failedOutcome(result.code !== 0 ? ddevStartFailure(result) : errorMessage(error))
  }
}

function ddevStartFailure(result: Awaited<ReturnType<DdevHost['run']>>): string {
  if (result.timedOut) {
    return ddevCommandFailure('ddev start', result, DDEV_START_TIMEOUT_MS)
  }
  const reason = ddevOutputSummary(`${result.stderr}\n${result.stdout}`)
  return reason ? `ddev start failed: ${reason}` : 'ddev start failed.'
}

export async function stopDdevSite(
  site: LocalStackSiteRef,
  options: DdevOptions = {}
): Promise<LocalStackOutcome> {
  const host = options.host ?? createDdevHost()
  const config = await findDdevProject(site.path, { host })
  if (!config) {
    return localStackSkip('not-managed', DDEV_NOT_MANAGED)
  }
  const ddev = host.findBinary('ddev')
  if (!ddev) {
    return failedOutcome(DDEV_NOT_INSTALLED)
  }
  // Docker down means nothing is running; stopping is already true.
  if (!(await isDockerRunning(host))) {
    return { ok: true, socketPath: '', state: 'stopped', message: `${config.name} is not running.` }
  }
  const result = await host.run(ddev, ['stop'], { cwd: config.root, timeoutMs: 2 * 60_000 })
  if (result.code !== 0) {
    return failedOutcome(
      `ddev stop failed: ${ddevOutputSummary(`${result.stderr}\n${result.stdout}`)}`
    )
  }
  return { ok: true, socketPath: '', state: 'stopped', message: `Stopped ${config.name}.` }
}

/** Probe, never start: building a run config must not boot Docker as a side effect. */
export async function ddevCredentials(
  site: LocalStackSiteRef,
  options: DdevOptions = {}
): Promise<LocalStackCredentials | null> {
  const host = options.host ?? createDdevHost()
  const config = await findDdevProject(site.path, { host })
  if (!config || !host.findBinary('ddev') || !(await isDockerRunning(host))) {
    return null
  }
  const state = await describeDdevProject(host, config.root).catch(() => null)
  if (!state?.db || state.status !== 'running') {
    return null
  }
  return {
    socketPath: '',
    port: state.db.port,
    user: state.db.user,
    password: state.db.password,
    database: state.db.name
  }
}

export const ddevProvider: LocalStackProvider = {
  id: 'ddev',
  // The CLI is the install; Docker being down is reported at Start, not by hiding the option.
  isAvailable: async () => createDdevHost().findBinary('ddev') !== null,
  detect: (sitePath) => detectDdevStack(sitePath),
  ensureRunning: (site, onStatus) => ensureDdevSiteRunning(site, onStatus),
  stop: (site) => stopDdevSite(site),
  credentials: (site) => ddevCredentials(site),
  certStatus: (domain) => ddevCertStatus(domain),
  certTrust: (domain) => ddevCertTrust(domain),
  certEnsure: async (domain, site, onStatus) => {
    const started = await ensureDdevSiteRunning(site, onStatus)
    if (!started.ok) {
      return { ok: false, message: started.message }
    }
    return ddevCertTrust(domain)
  }
}

// `runDdevJson` is re-exported for the setup module so both read DDEV's JSON the same way.
export { runDdevJson }

registerLocalStackProvider(ddevProvider)
