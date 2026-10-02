// Recording a stack that already serves a site's folder, and Local's database password.

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import { LOCALWP_DATABASE_PASSWORD, LOCALWP_DATABASE_USER } from '../sites/localwp-host'
import { findDdevProject } from '../sites/ddev-site-control'
import { setSiteSecret } from '../sites/site-secret-store'
import { detectSiteStack } from './site-stack-request'
import { notifySiteChanged } from './site-change-notifier'
import { requireSite } from './sites-result'

/**
 * Setup found the folder already served: record that stack and its domain, which the wizard's
 * "already serving" branch used to leave unsaved (stack stayed plain, no app/public, no socket).
 */
export async function adoptServingStack(
  store: Store,
  siteId: string
): Promise<{ stack: SiteLocalStack; domain: string }> {
  const site = requireSite(store, siteId)
  const detection = await detectSiteStack(site.path, site.localStack)
  if (
    detection.stack !== 'localwp' &&
    detection.stack !== 'agent-local' &&
    detection.stack !== 'ddev'
  ) {
    return { stack: site.localStack, domain: site.localDomain }
  }
  const domain = detection.domain.trim() || site.localDomain
  if (detection.stack === 'localwp') {
    const shellRoot = existsSync(path.join(site.path, 'app', 'public', 'wp-config.php'))
    store.updateSite(site.id, {
      localStack: 'localwp',
      localDomain: domain,
      ...(shellRoot ? { localWpRoot: 'app/public' } : {}),
      ...(detection.socketPath ? { dbSocket: detection.socketPath } : {}),
      dbUser: LOCALWP_DATABASE_USER,
      dbPort: null
    })
    persistLocalWpDatabasePassword(store, site.id)
  } else if (detection.stack === 'ddev') {
    const project = await findDdevProject(site.path)
    store.updateSite(site.id, {
      localStack: 'ddev',
      localDomain: domain,
      dbSocket: '',
      dbUser: 'db',
      ...(project ? { localWpRoot: project.docroot } : {})
    })
  } else {
    store.updateSite(site.id, { localStack: 'agent-local', localDomain: domain, dbSocket: '' })
  }
  notifySiteChanged(site.id)
  return { stack: detection.stack, domain }
}

/**
 * Records a finished Agent Local or DDEV setup. No password is stored: both hand it out live, so a
 * copy here would go stale the next time the site is re-provisioned or restarted.
 */
export function recordTcpStackSetup(
  store: Store,
  siteId: string,
  stack: 'agent-local' | 'ddev',
  result: {
    localWpRoot: string
    domain: string
    dbUser: string
    dbPort: number | null
    phpVersion: string
  }
): void {
  store.updateSite(siteId, {
    localStack: stack,
    localWpRoot: result.localWpRoot,
    localDomain: result.domain,
    // Empty socket is what selects the TCP branch downstream; never a placeholder path.
    dbSocket: '',
    dbUser: result.dbUser,
    dbPort: result.dbPort,
    ...(result.phpVersion ? { phpVersion: result.phpVersion } : {})
  })
  notifySiteChanged(siteId)
}

/**
 * Stores Local's MySQL root password so a later import can authenticate.
 *
 * Why every environment: ocsites keeps `db_user`/`db_password` in SITE_FIELD_KEYS (deploy/config.py
 * :38-47) because they are local-only concerns shared across environments, but Muster's secret
 * store is keyed per environment. Writing all of them keeps the credential reachable after an
 * environment switch instead of failing with "using password: NO" on the next import.
 */
export function persistLocalWpDatabasePassword(store: Store, siteId: string): void {
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
