// A DDEV project's live state, from `ddev describe` (and Docker when DDEV leaves a gap).

import { asRecord, readString } from './ddev-project-files'
import { runDdevJson, type DdevHost } from './ddev-host'

const DOCKER_PROBE_TIMEOUT_MS = 8_000

export type DdevProjectState = {
  name: string
  /** `running`, `stopped`, `paused`, `unhealthy`, … as DDEV reports it. */
  status: string
  approot: string
  docroot: string
  phpVersion: string
  /** e.g. `https://alchemy.ddev.site:8843` */
  primaryUrl: string
  db: { port: number; user: string; password: string; name: string } | null
  mutagen: boolean
}

export function parseDdevDescribe(raw: unknown): DdevProjectState {
  const record = asRecord(raw)
  const dbinfo = asRecord(record.dbinfo)
  const port = Number(dbinfo.published_port)
  return {
    name: readString(record, 'name'),
    status: readString(record, 'status'),
    approot: readString(record, 'approot'),
    docroot: readString(record, 'docroot'),
    phpVersion: readString(record, 'php_version'),
    primaryUrl: readString(record, 'primary_url'),
    db:
      Number.isInteger(port) && port > 0
        ? {
            port,
            user: readString(dbinfo, 'username') || 'db',
            password: readString(dbinfo, 'password') || 'db',
            name: readString(dbinfo, 'dbname') || 'db'
          }
        : null,
    mutagen: readString(record, 'performance_mode') === 'mutagen' || record.mutagen_enabled === true
  }
}

/** `host[:port]` from DDEV's primary URL: what Muster stores as the site's local domain. */
export function urlAuthority(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * Live project state. When DDEV marks the project unhealthy it can omit `dbinfo`; Docker still
 * knows the published port, so ask it directly rather than report no database.
 */
export async function describeDdevProject(host: DdevHost, root: string): Promise<DdevProjectState> {
  const state = parseDdevDescribe(await runDdevJson(host, ['describe'], { cwd: root }))
  if (state.db || state.status === 'stopped' || state.status === 'paused') {
    return state
  }
  const port = await dockerPublishedDbPort(host, state.name)
  return port ? { ...state, db: { port, user: 'db', password: 'db', name: 'db' } } : state
}

async function dockerPublishedDbPort(host: DdevHost, project: string): Promise<number | null> {
  const docker = host.findBinary('docker')
  if (!docker || !project) {
    return null
  }
  const result = await host.run(docker, ['port', `ddev-${project}-db`, '3306'], {
    timeoutMs: DOCKER_PROBE_TIMEOUT_MS
  })
  return parseDockerPort(result.stdout)
}

/** `0.0.0.0:32772` / `[::]:32772` lines from `docker port`; the first parsable port wins. */
export function parseDockerPort(output: string): number | null {
  for (const line of output.split('\n')) {
    const port = Number.parseInt(line.trim().split(':').pop() ?? '', 10)
    if (Number.isInteger(port) && port > 0) {
      return port
    }
  }
  return null
}

/** The router's HTTPS port from a primary URL (443 when the URL has none). */
export function routerHttpsPort(primaryUrl: string): number {
  try {
    const url = new URL(primaryUrl)
    return url.port ? Number(url.port) : 443
  } catch {
    return 443
  }
}

/**
 * Colima's port forwarder runs as the user, and macOS lets a user bind ports below 1024 only on
 * every address, not on 127.0.0.1 where DDEV's router listens. `ddev start` still reports success.
 */
export function privilegedRouterPortMessage(port: number): string {
  return (
    `DDEV started, but nothing answers on 127.0.0.1:${port}. With Colima, DDEV cannot use ports below 1024. ` +
    'Run `ddev config global --router-http-port=8880 --router-https-port=8843`, then start again.'
  )
}
