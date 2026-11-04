// Sets a site up on a local stack (DDEV, Agent Local or LocalWP) and records the result on the
// site. Shared by the `siteStacks:runMigration` channel and agent setup, so there is one path.

import type { Store } from '../persistence'
import { resolveAgentLocalDocroot, runAgentLocalMigration } from '../sites/agent-local-migration'
import { runDdevSetup } from '../sites/ddev-project-setup'
import { LOCALWP_DATABASE_USER } from '../sites/localwp-host'
import { runLocalWpMigration, type LocalWpMigrationResult } from '../sites/localwp-migration'
import { importMigratedDatabase } from './localwp-migrated-database-import'
import { notifySiteChanged } from './site-change-notifier'
import { persistLocalWpDatabasePassword, recordTcpStackSetup } from './site-stack-adopt'
import { buildMigrationRequest, readField, readTargetStack, requireId } from './site-stack-request'
import { requireSite } from './sites-result'

/** `statusFor` gets the secrets to redact, so no caller can forget the admin password. */
export async function runSiteStackMigration(
  store: Store,
  args: unknown,
  statusFor: (siteId: string, secrets: string[]) => (message: string) => void
): Promise<LocalWpMigrationResult> {
  const stack = readTargetStack(args)
  const request = buildMigrationRequest(store, args, stack)
  const site = requireSite(store, requireId(readField(args, 'siteId')))
  const onStatus = statusFor(site.id, [request.adminPassword])
  if (stack === 'ddev') {
    const result = await runDdevSetup(request, {
      docroot: resolveAgentLocalDocroot(site.path, site.localWpRoot),
      skipCoreDownload: readField(args, 'skipCoreDownload') === true,
      ...(site.phpVersion ? { phpVersion: site.phpVersion } : {}),
      onStatus
    })
    if (result.ok) {
      recordTcpStackSetup(store, site.id, 'ddev', result)
    }
    return result
  }
  if (stack === 'agent-local') {
    const result = await runAgentLocalMigration(request, {
      onStatus,
      phpVersion: site.phpVersion,
      // The docroot agent-local should serve, which is not always the stored LocalWP subpath.
      sourcePath: resolveAgentLocalDocroot(site.path, site.localWpRoot)
    })
    if (result.ok) {
      recordTcpStackSetup(store, site.id, 'agent-local', result)
    }
    return result
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
    notifySiteChanged(site.id)
    persistLocalWpDatabasePassword(store, site.id)
  }
  return result
}
