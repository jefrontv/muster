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
import type { SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import { importLocalDatabase } from '../sites/local-database-import'
import {
  planAgentLocalMigration,
  resolveAgentLocalDocroot,
  runAgentLocalMigration
} from '../sites/agent-local-migration'
import { setAgentLocalSiteDomain } from '../sites/agent-local-site-control'
import { providerFor, type LocalStackOutcome } from '../sites/local-stack-provider'
import { startStackWithPortHandover } from '../sites/local-stack-port-handover'
import { currentSocketIfRunning } from '../sites/localwp-detection'
import {
  createLocalWpHost,
  isLocalWpSupported,
  LOCALWP_DATABASE_PASSWORD,
  LOCALWP_DATABASE_USER
} from '../sites/localwp-host'
import { setSiteSecret } from '../sites/site-secret-store'
import type { LocalWpMigrationPlan } from '../sites/localwp-migration-plan'
import {
  previewLocalWpMigration,
  runLocalWpMigration,
  type LocalWpMigrationResult
} from '../sites/localwp-migration'
import type { LocalWpControlOutcome } from '../sites/localwp-site-control'
import type { SiteRunConfig, SiteRunContext } from '../sites/pipeline-contract'
import {
  buildMigrationRequest,
  detectSiteStack,
  persistResolvedTransport,
  readField,
  readTargetStack,
  requireId
} from './site-stack-request'
import { createMigrationProgressForwarder } from './site-stack-progress'
import { failure, requireSite, type SiteResult } from './sites-result'

const SITE_STACK_CHANNELS = [
  'siteStacks:detect',
  'siteStacks:start',
  'siteStacks:stop',
  'siteStacks:resolveSocket',
  'siteStacks:available',
  'siteStacks:previewMigration',
  'siteStacks:runMigration'
] as const

/** The stacks a user can be offered. `plain` is the absence of one and is never a choice. */
const OFFERABLE_STACKS: SiteLocalStack[] = ['localwp', 'agent-local']

/**
 * Strips the live database password before an outcome crosses the bridge.
 *
 * A stack reports credentials so the main process can reach the database; the renderer never
 * connects to MySQL itself, and anything handed to it can end up in component state, a devtools
 * inspection, or a bug report. The password stays on the main side, where the run config picks it
 * up per run.
 */
function withoutStackSecrets(outcome: LocalStackOutcome): LocalWpControlOutcome {
  const { password: _password, ...safe } = outcome
  return safe
}

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
        const outcome = await startStackWithPortHandover({
          path: site.path,
          localStack: site.localStack,
          localWpRoot: site.localWpRoot
        })
        // Persist whatever transport the stack resolved to. LocalWP re-keys its socket directory on
        // restart and agent-local can re-provision a site's user; a stale stored value is the usual
        // cause of "Can't connect to local MySQL". The password is deliberately NOT persisted — it
        // is fetched live when a run needs it.
        persistResolvedTransport(store, site, outcome)
        return { ok: true, value: withoutStackSecrets(outcome) }
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
          value: withoutStackSecrets(
            await providerFor(site.localStack).stop({
              path: site.path,
              localStack: site.localStack,
              localWpRoot: site.localWpRoot
            })
          )
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Only agent-local can move an existing site's domain; LocalWP has no equivalent, so this is not
  // on the provider interface. A site on another stack is told so rather than silently doing nothing.
  ipcMain.handle(
    'siteStacks:setDomain',
    async (
      _event,
      args: { siteId?: unknown; domain?: unknown }
    ): Promise<SiteResult<LocalWpControlOutcome>> => {
      try {
        const site = requireSite(store, requireId(args?.siteId))
        const domain = typeof args?.domain === 'string' ? args.domain.trim() : ''
        if (domain.length === 0) {
          throw new Error('A new domain is required.')
        }
        if (site.localStack !== 'agent-local') {
          throw new Error('Only Agent Local sites can have their domain changed from Muster.')
        }
        const outcome = await setAgentLocalSiteDomain(
          { path: site.path, localStack: site.localStack, localWpRoot: site.localWpRoot },
          domain
        )
        // The record follows the stack, not the other way round: deploys and search-replace read
        // localDomain, and leaving it on the old value would point them at a domain nothing serves.
        if (outcome.ok) {
          store.updateSite(site.id, { localDomain: domain })
        }
        return { ok: true, value: withoutStackSecrets(outcome) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Which stacks this machine can actually run. The renderer offers only these, so a user without
  // agent-local never sees an option that would fail, and one without Local is not stuck with it.
  ipcMain.handle('siteStacks:available', async (): Promise<SiteResult<SiteLocalStack[]>> => {
    try {
      const checks = await Promise.all(
        OFFERABLE_STACKS.map(async (stack) => ({
          stack,
          // An availability probe must never throw: it gates a UI affordance, not a run.
          available: await providerFor(stack)
            .isAvailable()
            .catch(() => false)
        }))
      )
      return { ok: true, value: checks.filter((entry) => entry.available).map((e) => e.stack) }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle(
    'siteStacks:previewMigration',
    async (_event, args: unknown): Promise<SiteResult<LocalWpMigrationPlan>> => {
      try {
        const stack = readTargetStack(args)
        const request = buildMigrationRequest(store, args, stack)
        if (stack === 'agent-local') {
          // The same docroot runMigration hands over, so the gate and the action agree about which
          // folder has to contain WordPress.
          const site = requireSite(store, requireId(readField(args, 'siteId')))
          return {
            ok: true,
            value: planAgentLocalMigration(
              request,
              resolveAgentLocalDocroot(site.path, site.localWpRoot)
            )
          }
        }
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
        const stack = readTargetStack(args)
        const request = buildMigrationRequest(store, args, stack)
        const site = requireSite(store, requireId(readField(args, 'siteId')))
        const onStatus = createMigrationProgressForwarder(event.sender, site.id, [
          request.adminPassword
        ])
        if (stack === 'agent-local') {
          const result = await runAgentLocalMigration(request, {
            onStatus,
            phpVersion: site.phpVersion,
            // The docroot agent-local should serve, which is not always the stored LocalWP subpath.
            sourcePath: resolveAgentLocalDocroot(site.path, site.localWpRoot)
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
