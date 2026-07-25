// Reads Local's own config and runtime state to answer "is this site LocalWP-managed, and where is
// its MySQL socket?". Ported from ocsites deploy/create_localwp.py.
//
// macOS-only: every entry point returns an empty/null answer on other platforms and spawns nothing.

import path from 'node:path'
import {
  isLocalWpSupported,
  LOCALWP_PROBE_TIMEOUT_MS,
  LOCALWP_UNSUPPORTED_PLATFORM,
  localWpServicesDirectory,
  localWpSocketPath,
  localWpSupportDirectory,
  localWpWordPressRoot,
  readLocalWpJsonRecord,
  type LocalWpHost
} from './localwp-host'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'

export type { LocalWpStackDetection }

const DEFAULT_GRAPHQL_PORT = 4_000

export type LocalWpConnectionInfo = { port: number | null; authToken: string }

export type LocalWpGraphqlEndpoint = { url: string; port: number }

export async function isLocalWpAppRunning(host: LocalWpHost): Promise<boolean> {
  if (!isLocalWpSupported(host)) {
    return false
  }
  return (await host.run('pgrep', ['-x', 'Local'])).code === 0
}

export async function readLocalWpConnectionInfo(
  host: LocalWpHost
): Promise<LocalWpConnectionInfo | null> {
  if (!isLocalWpSupported(host)) {
    return null
  }
  const parsed = await readLocalWpJsonRecord(
    host,
    path.join(localWpSupportDirectory(host), 'graphql-connection-info.json')
  )
  if (!parsed) {
    return null
  }
  return {
    port: typeof parsed.port === 'number' ? parsed.port : null,
    authToken: typeof parsed.authToken === 'string' ? parsed.authToken : ''
  }
}

/**
 * Ports the live Local process is actually listening on. Local rewrites its connection-info file
 * with a fresh port on most launches but the file still goes stale, so ask the process via lsof
 * rather than trusting what it wrote down.
 */
export async function listLocalWpListenPorts(host: LocalWpHost): Promise<number[]> {
  if (!isLocalWpSupported(host)) {
    return []
  }
  const pgrep = await host.run('pgrep', ['-x', 'Local'])
  const pids = pgrep.stdout.split(/\s+/).filter((token) => /^\d+$/.test(token))
  const ports: number[] = []
  for (const pid of pids) {
    const lsof = await host.run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pid])
    for (const port of parseListeningPorts(lsof.stdout)) {
      if (!ports.includes(port)) {
        ports.push(port)
      }
    }
  }
  return ports
}

// lsof NAME column: '... 127.0.0.1:4000 (LISTEN)' or '[::1]:4000 (LISTEN)'. The address:port token
// is always the field immediately before '(LISTEN)'.
function parseListeningPorts(stdout: string): number[] {
  const ports: number[] = []
  for (const line of stdout.split('\n')) {
    const tokens = line.split(/\s+/).filter(Boolean)
    const listenIndex = tokens.indexOf('(LISTEN)')
    if (listenIndex < 1) {
      continue
    }
    const address = tokens[listenIndex - 1] ?? ''
    const separator = address.lastIndexOf(':')
    const portPart = separator === -1 ? '' : address.slice(separator + 1)
    if (/^\d+$/.test(portPart)) {
      ports.push(Number.parseInt(portPart, 10))
    }
  }
  return ports
}

/**
 * Ordered GraphQL endpoints: the advertised port first, then whatever the live process is bound to,
 * then the historical default. Ports that refuse a connection are dropped, so a stale
 * connection-info port cannot make site creation fail against a port that would have answered.
 */
export async function resolveGraphqlEndpointCandidates(
  host: LocalWpHost,
  connection: LocalWpConnectionInfo
): Promise<LocalWpGraphqlEndpoint[]> {
  const candidates: number[] = []
  if (connection.port !== null) {
    candidates.push(connection.port)
  }
  for (const port of await listLocalWpListenPorts(host)) {
    if (!candidates.includes(port)) {
      candidates.push(port)
    }
  }
  if (!candidates.includes(DEFAULT_GRAPHQL_PORT)) {
    candidates.push(DEFAULT_GRAPHQL_PORT)
  }
  const endpoints: LocalWpGraphqlEndpoint[] = []
  for (const port of candidates) {
    if (await host.isTcpPortOpen(port, LOCALWP_PROBE_TIMEOUT_MS)) {
      endpoints.push({ url: `http://127.0.0.1:${port}/graphql`, port })
    }
  }
  return endpoints
}

/**
 * Newest installed Local lightning service, as 'name-version'. Local strips the +N build suffix
 * (apache-2.4.43+11 → 2.4.43) when indexing services, so the GraphQL mutation's
 * webServer/phpVersion/database fields must use the stripped form.
 */
export async function resolveLocalWpServiceVersion(
  host: LocalWpHost,
  serviceName: string
): Promise<string | null> {
  const prefix = `${serviceName}-`
  const newest = (await listServiceDirectories(host, prefix))[0]
  if (!newest) {
    return null
  }
  return `${serviceName}-${newest.slice(prefix.length).split('+')[0]}`
}

/** Installed service directories with the given prefix, newest first. */
export async function listServiceDirectories(host: LocalWpHost, prefix: string): Promise<string[]> {
  return (await host.listDirectory(localWpServicesDirectory(host)))
    .filter((name) => name.startsWith(prefix))
    .sort()
    .toReversed()
}

/** Extracts the site id from .../Local/run/<siteId>/mysql/mysqld.sock. */
export function siteIdFromSocketPath(socketPath: string): string | null {
  const segments = socketPath.split(/[/\\]+/)
  const runIndex = segments.indexOf('run')
  if (runIndex === -1) {
    return null
  }
  return segments[runIndex + 1] ?? null
}

export async function readLocalWpSites(
  host: LocalWpHost
): Promise<Record<string, Record<string, unknown>>> {
  if (!isLocalWpSupported(host)) {
    return {}
  }
  const parsed = await readLocalWpJsonRecord(
    host,
    path.join(localWpSupportDirectory(host), 'sites.json')
  )
  const sites: Record<string, Record<string, unknown>> = {}
  for (const [siteId, record] of Object.entries(parsed ?? {})) {
    if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
      sites[siteId] = record as Record<string, unknown>
    }
  }
  return sites
}

/** The registered site id whose path matches sitePath, or null. Compares resolved paths. */
export async function findLocalWpSiteId(
  host: LocalWpHost,
  sitePath: string
): Promise<string | null> {
  const sites = await readLocalWpSites(host)
  const target = await host.canonicalPath(sitePath)
  for (const [siteId, record] of Object.entries(sites)) {
    const registeredPath = record.path
    if (typeof registeredPath !== 'string' || registeredPath.length === 0) {
      continue
    }
    if ((await host.canonicalPath(registeredPath)) === target) {
      return siteId
    }
  }
  return null
}

export async function isSiteRegisteredWithLocalWp(
  host: LocalWpHost,
  sitePath: string
): Promise<boolean> {
  return (await findLocalWpSiteId(host, sitePath)) !== null
}

/** The site's configured PHP version (e.g. '8.2.29') from sites.json. */
export async function readSitePhpVersion(
  host: LocalWpHost,
  siteId: string
): Promise<string | null> {
  const services = (await readLocalWpSites(host))[siteId]?.services
  const php = isRecord(services) ? services.php : undefined
  const version = isRecord(php) ? php.version : undefined
  return typeof version === 'string' || typeof version === 'number' ? String(version) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The live MySQL socket for a site, or null when its mysqld is not accepting connections. */
export async function currentSocketIfRunning(
  host: LocalWpHost,
  sitePath: string,
  timeoutMs = LOCALWP_PROBE_TIMEOUT_MS
): Promise<string | null> {
  const siteId = await findLocalWpSiteId(host, sitePath)
  if (!siteId) {
    return null
  }
  const candidate = localWpSocketPath(host, siteId)
  if (!(await host.pathExists(candidate))) {
    return null
  }
  return (await host.isMysqlSocketReady(candidate, timeoutMs)) ? candidate : null
}

export async function detectLocalWpStack(
  host: LocalWpHost,
  sitePath: string
): Promise<LocalWpStackDetection> {
  if (!isLocalWpSupported(host)) {
    return {
      supported: false,
      reason: LOCALWP_UNSUPPORTED_PLATFORM,
      stack: 'plain',
      appRunning: false,
      registered: false,
      siteId: '',
      socketPath: '',
      socketReady: false,
      phpVersion: ''
    }
  }
  const siteId = await findLocalWpSiteId(host, sitePath)
  const hasLocalWpLayout = await host.pathExists(
    path.join(localWpWordPressRoot(sitePath), 'wp-config.php')
  )
  const liveSocket = await currentSocketIfRunning(host, sitePath)
  return {
    supported: true,
    reason: '',
    // MAMP/DBngin exposes no discoverable marker — it stays the user-declared TCP path.
    stack: siteId !== null || hasLocalWpLayout ? 'localwp' : 'plain',
    appRunning: await isLocalWpAppRunning(host),
    registered: siteId !== null,
    siteId: siteId ?? '',
    socketPath: liveSocket ?? '',
    socketReady: liveSocket !== null,
    phpVersion: siteId ? ((await readSitePhpVersion(host, siteId)) ?? '') : ''
  }
}
