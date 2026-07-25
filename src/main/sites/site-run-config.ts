// Builds the SiteRunConfig a pipeline executes from stored state.
//
// This is the only place secrets are decrypted for a run: everything downstream receives them as
// plain fields on the config and must never log them. Keeping the decryption here means the
// pipelines stay free of Electron and the secret store, and remain testable with a literal config.

import path from 'node:path'
import type { Site, SiteRunGroup } from '../../shared/site-types'
import { SiteRunStepError, type SiteRunConfig } from './pipeline-contract'
import { getSiteSecret } from './site-secret-store'

export const SITE_RUN_CONFIG_STEP = 'run-config'

export function resolveSiteWpDir(site: Site): string {
  const subPath = site.localWpRoot.replace(/^[/\\]+|[/\\]+$/g, '')
  return subPath.length > 0 ? path.join(site.path, subPath) : site.path
}

export function buildSiteRunConfig(
  site: Site,
  environmentName: string,
  group: SiteRunGroup
): SiteRunConfig {
  const environment = site.environments[environmentName]
  if (!environment) {
    throw new SiteRunStepError(
      SITE_RUN_CONFIG_STEP,
      `Site '${site.displayName}' has no environment named '${environmentName}'.`
    )
  }
  return {
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
