// Builds the SiteRunConfig a pipeline executes from stored state.
//
// This is the only place secrets are decrypted for a run: everything downstream receives them as
// plain fields on the config and must never log them. Keeping the decryption here means the
// pipelines stay free of Electron and the secret store, and remain testable with a literal config.
//
// It is also the only place a stack's live database transport is resolved, which is why the builder
// is async. A stack that owns its own credentials (agent-local mints a per-site MariaDB user and
// hands the password out on demand) has nothing in the secret store to read, and copying one in
// would go stale the moment the site is re-provisioned. Fetching here means every consumer —
// connection health, snapshots, wp-cli, search-replace — gets working credentials without knowing
// which stack it is on.

import path from 'node:path'
import type { Site, SiteRunGroup } from '../../shared/site-types'
import { providerFor } from './local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import './agent-local-site-control'
import { SiteRunStepError, type SiteRunConfig } from './pipeline-contract'
import { getSiteSecret } from './site-secret-store'

export const SITE_RUN_CONFIG_STEP = 'run-config'

export function resolveSiteWpDir(site: Site): string {
  const subPath = site.localWpRoot.replace(/^[/\\]+|[/\\]+$/g, '')
  return subPath.length > 0 ? path.join(site.path, subPath) : site.path
}

export async function buildSiteRunConfig(
  site: Site,
  environmentName: string,
  group: SiteRunGroup
): Promise<SiteRunConfig> {
  const environment = site.environments[environmentName]
  if (!environment) {
    throw new SiteRunStepError(
      SITE_RUN_CONFIG_STEP,
      `Site '${site.displayName}' has no environment named '${environmentName}'.`
    )
  }
  const config: SiteRunConfig = {
    site,
    environmentName,
    environment,
    group,
    wpDir: resolveSiteWpDir(site),
    // A missing secret is not an error here: a local-only run needs neither, and the pipeline
    // fails with a precise message at the step that actually needs one.
    sshPassword: readSecret(site.id, environmentName, 'ssh'),
    dbPassword: readSecret(site.id, environmentName, 'db')
  }
  return applyStackCredentials(config)
}

/**
 * Overlays the stack's live database transport, when it has one.
 *
 * Stored values stay authoritative for `plain` and `mamp`, whose provider reports nothing: those
 * sites are configured by hand and Muster must not second-guess them. A stack that does answer is
 * more current than anything on the site record, including after the user moved the site between
 * stacks without re-running detection.
 */
async function applyStackCredentials(config: SiteRunConfig): Promise<SiteRunConfig> {
  const credentials = await providerFor(config.site.localStack)
    .credentials({
      path: config.site.path,
      localStack: config.site.localStack,
      localWpRoot: config.site.localWpRoot
    })
    // A stack that cannot be reached must not break config building — the run reports it at the
    // step that needs the database, with a message about the stack rather than about a password.
    .catch(() => null)
  if (!credentials) {
    return config
  }
  return {
    ...config,
    site: {
      ...config.site,
      dbSocket: credentials.socketPath,
      dbPort: credentials.socketPath ? config.site.dbPort : credentials.port,
      dbUser: credentials.user || config.site.dbUser
    },
    dbPassword: credentials.password || config.dbPassword,
    localDatabaseName: credentials.database || config.localDatabaseName
  }
}

function readSecret(siteId: string, environmentName: string, kind: 'ssh' | 'db'): string {
  try {
    return getSiteSecret(siteId, environmentName, kind) ?? ''
  } catch {
    // A decrypt failure (denied keychain prompt, app re-signed) must not abort config building;
    // the run reports it as a missing credential where it is used.
    return ''
  }
}
