// Loading a pre-migration dump into a freshly created LocalWP site.

import path from 'node:path'
import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { Store } from '../persistence'
import { importLocalDatabase } from '../sites/local-database-import'
import { LOCALWP_DATABASE_PASSWORD, LOCALWP_DATABASE_USER } from '../sites/localwp-host'
import type { SiteRunConfig, SiteRunContext } from '../sites/pipeline-contract'
import { requireSite } from './sites-result'

/**
 * Imports the pre-migration dump into Local's MySQL over the new socket.
 *
 * As in ocsites (tui_deploy:3133), the import authenticates as root over the per-site socket, not
 * with the credentials from the migrated wp-config.php: the dump was taken from the OLD server and
 * Local owns the accounts on the new one.
 */
export async function importMigratedDatabase(
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
