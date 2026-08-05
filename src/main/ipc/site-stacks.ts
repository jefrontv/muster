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
import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { Store } from '../persistence'
import { importLocalDatabase } from '../sites/local-database-import'
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
import {
  ensureSiteRunning,
  stopSite,
  type LocalWpControlOutcome
} from '../sites/localwp-site-control'
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
      return { ok: true, value: await detectLocalWpStack(createLocalWpHost(), site.path) }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'siteStacks:resolveSocket',
    async (_event, siteId: unknown): Promise<SiteResult<string>> => {
      try {
        const host = createLocalWpHost()
        if (!isLocalWpSupported(host)) {
          return { ok: true, value: '' }
        }
        const site = requireSite(store, requireId(siteId))
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
        const outcome = await ensureSiteRunning(site.path)
        // A LocalWP restart re-keys the socket directory, so persist whatever it resolved to;
        // a stale stored socket is the usual cause of "Can't connect to local MySQL".
        if (outcome.socketPath && outcome.socketPath !== site.dbSocket) {
          store.updateSite(site.id, { dbSocket: outcome.socketPath })
        }
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
        return { ok: true, value: await stopSite(site.path) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteStacks:previewMigration',
    async (_event, args: unknown): Promise<SiteResult<LocalWpMigrationPlan>> => {
      try {
        const request = buildMigrationRequest(store, args)
        return { ok: true, value: await previewLocalWpMigration(request) }
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
        const request = buildMigrationRequest(store, args)
        const site = requireSite(store, requireId(readField(args, 'siteId')))
        const result = await runLocalWpMigration(request, {
          importDatabase: (options) => importMigratedDatabase(store, site.id, options),
          onStatus: createMigrationProgressForwarder(event.sender, site.id, [request.adminPassword])
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

function buildMigrationRequest(store: Store, args: unknown): LocalWpMigrationRequest {
  if (!isLocalWpSupported(createLocalWpHost())) {
    throw new Error(LOCALWP_UNSUPPORTED_PLATFORM)
  }
  const site = requireSite(store, requireId(readField(args, 'siteId')))
  return {
    sitePath: site.path,
    siteName: site.displayName || path.basename(site.path),
    domain: requireField(readField(args, 'domain'), 'domain'),
    adminEmail: requireField(readField(args, 'adminEmail'), 'adminEmail'),
    adminPassword: requireField(readField(args, 'adminPassword'), 'adminPassword'),
    force: readField(args, 'force') === true
  }
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
