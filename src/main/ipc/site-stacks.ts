// IPC for a site's local WordPress stack: LocalWP detection, start/stop, socket resolution, and the
// migrate-a-plain-site-into-LocalWP flow.
//
// Handlers never throw across the bridge — an exception loses its type and its stack in the renderer
// — so every channel returns the tagged SiteResult union, matching ipc/ephemeral-vm.ts.
//
// The whole surface is macOS-only. Non-darwin callers get a structured "unsupported" value rather
// than an error, so the renderer can render a disabled state instead of an alert.

import path from 'node:path'
import { ipcMain } from 'electron'
import { createEmptySiteEnvironment, SITE_LOCAL_STACKS } from '../../shared/site-types'
import type { Site, SiteLocalStack } from '../../shared/site-types'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import type { Store } from '../persistence'
import { importLocalDatabase } from '../sites/local-database-import'
import { planAgentLocalMigration, runAgentLocalMigration } from '../sites/agent-local-migration'
import { providerFor, type LocalStackOutcome } from '../sites/local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import '../sites/agent-local-site-control'
import { currentSocketIfRunning, detectLocalWpStack } from '../sites/localwp-detection'
import {
  createLocalWpHost,
  isLocalWpSupported,
  LOCALWP_DATABASE_PASSWORD,
  LOCALWP_DATABASE_USER,
  LOCALWP_UNSUPPORTED_PLATFORM
} from '../sites/localwp-host'
import { setSiteSecret } from '../sites/site-secret-store'
import type { LocalWpMigrationPlan, LocalWpMigrationRequest } from '../sites/localwp-migration-plan'
import {
  previewLocalWpMigration,
  runLocalWpMigration,
  type LocalWpMigrationResult
} from '../sites/localwp-migration'
import type { LocalWpControlOutcome } from '../sites/localwp-site-control'
import type { SiteRunConfig, SiteRunContext } from '../sites/pipeline-contract'
import { createMigrationProgressForwarder } from './site-stack-progress'
import { failure, requireSite, type SiteResult } from './sites-result'

const SITE_STACK_CHANNELS = [
  'siteStacks:detect',
  'siteStacks:start',
  'siteStacks:stop',
  'siteStacks:resolveSocket',
  'siteStacks:previewMigration',
  'siteStacks:runMigration'
] as const

const MAX_FIELD_LENGTH = 256

export function registerSiteStackHandlers(store: Store): void {
  for (const channel of SITE_STACK_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('siteStacks:detect', async (_event, siteId: unknown) => {
    try {
      const site = requireSite(store, requireId(siteId))
      return { ok: true, value: await detectSiteStack(site.path) }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'siteStacks:resolveSocket',
    async (_event, siteId: unknown): Promise<SiteResult<string>> => {
      try {
        const site = requireSite(store, requireId(siteId))
        // A TCP stack has no socket to resolve, and must answer '' rather than probing LocalWP's
        // socket directory for a site that was never in it.
        if (site.localStack !== 'localwp') {
          return { ok: true, value: '' }
        }
        const host = createLocalWpHost()
        if (!isLocalWpSupported(host)) {
          return { ok: true, value: '' }
        }
        return { ok: true, value: (await currentSocketIfRunning(host, site.path)) ?? '' }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteStacks:start',
    async (_event, siteId: unknown): Promise<SiteResult<LocalWpControlOutcome>> => {
      try {
        const site = requireSite(store, requireId(siteId))
        const outcome = await providerFor(site.localStack).ensureRunning({
          path: site.path,
          localStack: site.localStack,
          localWpRoot: site.localWpRoot
        })
        // Persist whatever transport the stack resolved to. LocalWP re-keys its socket directory on
        // restart and agent-local can re-provision a site's user; a stale stored value is the usual
        // cause of "Can't connect to local MySQL". The password is deliberately NOT persisted — it
        // is fetched live when a run needs it.
        persistResolvedTransport(store, site, outcome)
        return { ok: true, value: outcome }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteStacks:stop',
    async (_event, siteId: unknown): Promise<SiteResult<LocalWpControlOutcome>> => {
      try {
        const site = requireSite(store, requireId(siteId))
        return {
          ok: true,
          value: await providerFor(site.localStack).stop({
            path: site.path,
            localStack: site.localStack,
            localWpRoot: site.localWpRoot
          })
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteStacks:previewMigration',
    async (_event, args: unknown): Promise<SiteResult<LocalWpMigrationPlan>> => {
      try {
        const stack = readTargetStack(args)
        const request = buildMigrationRequest(store, args, stack)
        return {
          ok: true,
          value:
            stack === 'agent-local'
              ? planAgentLocalMigration(request)
              : await previewLocalWpMigration(request)
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Destructive: the renderer must show the preview and take an explicit confirmation first, and
  // pass `force: true` to accept deleting an existing app/public.
  ipcMain.handle(
    'siteStacks:runMigration',
    async (event, args: unknown): Promise<SiteResult<LocalWpMigrationResult>> => {
      try {
        const stack = readTargetStack(args)
        const request = buildMigrationRequest(store, args, stack)
        const site = requireSite(store, requireId(readField(args, 'siteId')))
        const onStatus = createMigrationProgressForwarder(event.sender, site.id, [
          request.adminPassword
        ])
        if (stack === 'agent-local') {
          const result = await runAgentLocalMigration(request, {
            onStatus,
            phpVersion: site.phpVersion
          })
          if (result.ok) {
            store.updateSite(site.id, {
              localStack: 'agent-local',
              localWpRoot: result.localWpRoot,
              localDomain: result.domain,
              // Empty socket is what selects the TCP branch downstream; never a placeholder path.
              dbSocket: '',
              dbUser: result.dbUser,
              dbPort: result.dbPort,
              ...(result.phpVersion ? { phpVersion: result.phpVersion } : {})
            })
            // No password is stored: agent-local mints it and hands it out on demand, so a copy here
            // would only go stale the next time the site is re-provisioned.
          }
          return { ok: true, value: result }
        }
        const result = await runLocalWpMigration(request, {
          importDatabase: (options) => importMigratedDatabase(store, site.id, options),
          onStatus
        })
        if (result.ok) {
          store.updateSite(site.id, {
            localStack: 'localwp',
            localWpRoot: result.localWpRoot,
            localDomain: request.domain,
            dbSocket: result.socketPath,
            dbUser: LOCALWP_DATABASE_USER,
            dbPort: null
          })
          persistLocalWpDatabasePassword(store, site.id)
        }
        return { ok: true, value: result }
      } catch (error) {
        return failure(error)
      }
    }
  )
}

/**
 * Stores Local's MySQL root password so a later import can authenticate.
 *
 * Why every environment: ocsites keeps `db_user`/`db_password` in SITE_FIELD_KEYS (deploy/config.py
 * :38-47) because they are local-only concerns shared across environments, but Muster's secret
 * store is keyed per environment. Writing all of them keeps the credential reachable after an
 * environment switch instead of failing with "using password: NO" on the next import.
 */
function persistLocalWpDatabasePassword(store: Store, siteId: string): void {
  const site = requireSite(store, siteId)
  for (const environmentName of Object.keys(site.environments)) {
    try {
      setSiteSecret(siteId, environmentName, 'db', LOCALWP_DATABASE_PASSWORD)
    } catch {
      // A locked keychain must not fail the migration that already succeeded on disk; the import
      // reports the missing credential precisely at the step that needs it.
    }
  }
}

/**
 * Imports the pre-migration dump into Local's MySQL over the new socket.
 *
 * As in ocsites (tui_deploy:3133), the import authenticates as root over the per-site socket, not
 * with the credentials from the migrated wp-config.php: the dump was taken from the OLD server and
 * Local owns the accounts on the new one.
 */
async function importMigratedDatabase(
  store: Store,
  siteId: string,
  options: { dumpPath: string; databaseName: string; socketPath: string }
): Promise<void> {
  const site = requireSite(store, siteId)
  const controller = new AbortController()
  const context: SiteRunContext = {
    signal: controller.signal,
    log: () => {},
    status: () => {},
    progress: () => {},
    throwIfCancelled: () => {}
  }
  const config: SiteRunConfig = {
    site: { ...site, dbSocket: options.socketPath, dbUser: LOCALWP_DATABASE_USER, dbPort: null },
    environmentName: site.activeEnvironment,
    // A local DB import needs no remote target; keep the field type-honest for the shared config.
    environment:
      site.environments[site.activeEnvironment] ??
      Object.values(site.environments)[0] ??
      createEmptySiteEnvironment(),
    group: 'import',
    wpDir: path.join(site.path, 'app', 'public'),
    sshPassword: '',
    dbPassword: LOCALWP_DATABASE_PASSWORD
  }
  await importLocalDatabase(context, config, options.dumpPath, options.databaseName)
}

/**
 * Which stack a detection pass should report.
 *
 * agent-local is probed first because the layout heuristics cannot tell the two apart: agent-local
 * imports a LocalWP site in place, docroot and all, so an `app/public` checkout managed by
 * agent-local looks exactly like a LocalWP one on disk. Only agent-local's own registry knows.
 */
export async function detectSiteStack(sitePath: string): Promise<LocalWpStackDetection> {
  const agentLocal = await providerFor('agent-local')
    .detect(sitePath)
    // A missing or wedged daemon must not stop LocalWP detection from answering.
    .catch(() => null)
  if (agentLocal?.stack === 'agent-local') {
    return agentLocal
  }
  return detectLocalWpStack(createLocalWpHost(), sitePath)
}

/** Persists the transport a start resolved to, leaving the fields the stack did not report alone. */
function persistResolvedTransport(store: Store, site: Site, outcome: LocalStackOutcome): void {
  const updates: Partial<Site> = {}
  if (outcome.socketPath) {
    if (outcome.socketPath !== site.dbSocket) {
      updates.dbSocket = outcome.socketPath
    }
  } else if (outcome.port || outcome.user) {
    if (site.dbSocket) {
      updates.dbSocket = ''
    }
    if (outcome.port && outcome.port !== site.dbPort) {
      updates.dbPort = outcome.port
    }
    if (outcome.user && outcome.user !== site.dbUser) {
      updates.dbUser = outcome.user
    }
  }
  if (Object.keys(updates).length > 0) {
    store.updateSite(site.id, updates)
  }
}

/** The stack a migration targets. Absent means LocalWP, which is what every existing caller means. */
function readTargetStack(args: unknown): SiteLocalStack {
  const value = readField(args, 'stack')
  if (value === undefined || value === null) {
    return 'localwp'
  }
  if (!SITE_LOCAL_STACKS.some((stack) => stack === value)) {
    throw new TypeError(`Unknown local stack: ${String(value)}`)
  }
  return value as SiteLocalStack
}

function buildMigrationRequest(
  store: Store,
  args: unknown,
  stack: SiteLocalStack = 'localwp'
): LocalWpMigrationRequest {
  // LocalWP's platform gate is its own; agent-local reports unsupported through its provider so the
  // renderer gets a structured result instead of a thrown string.
  if (stack === 'localwp' && !isLocalWpSupported(createLocalWpHost())) {
    throw new Error(LOCALWP_UNSUPPORTED_PLATFORM)
  }
  const site = requireSite(store, requireId(readField(args, 'siteId')))
  // LocalWP creates the WordPress install, so it needs admin credentials to seed it. agent-local
  // adopts an install that already has its own users and never sees them — requiring them there
  // would only be a form the user has to fill in for nothing.
  const adminRequired = stack === 'localwp'
  return {
    sitePath: site.path,
    siteName: site.displayName || path.basename(site.path),
    domain: requireField(readField(args, 'domain'), 'domain'),
    adminEmail: adminRequired
      ? requireField(readField(args, 'adminEmail'), 'adminEmail')
      : optionalField(readField(args, 'adminEmail')),
    adminPassword: adminRequired
      ? requireField(readField(args, 'adminPassword'), 'adminPassword')
      : optionalField(readField(args, 'adminPassword')),
    force: readField(args, 'force') === true
  }
}

function optionalField(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_FIELD_LENGTH ? value : ''
}

function readField(args: unknown, key: string): unknown {
  if (typeof args !== 'object' || args === null) {
    throw new TypeError('Expected an arguments object')
  }
  return (args as Record<string, unknown>)[key]
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError('siteId must be a non-empty string')
  }
  return value
}

function requireField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value
}
