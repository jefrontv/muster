// Recording a stack that already serves a site's folder, and Local's database password.

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SiteLocalStack } from '../../shared/site-types'
import type { Store } from '../persistence'
import { LOCALWP_DATABASE_PASSWORD, LOCALWP_DATABASE_USER } from '../sites/localwp-host'
import { setSiteSecret } from '../sites/site-secret-store'
import { detectSiteStack } from './site-stack-request'
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
  const detection = await detectSiteStack(site.path)
  if (detection.stack !== 'localwp' && detection.stack !== 'agent-local') {
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
  } else {
    store.updateSite(site.id, { localStack: 'agent-local', localDomain: domain, dbSocket: '' })
  }
  return { stack: detection.stack, domain }
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
