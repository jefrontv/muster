// Turns a (site, environment, group) into the job the run service executes.
//
// The pipelines are deliberately dependency-injected so each slice stays testable in isolation.
// This is the single wiring point where those injections are bound to the real modules — the run
// service and the IPC layer never see a pipeline's dependency shape.

import type { Site, SiteRunGroup } from '../../shared/site-types'
import type { SiteRunContext } from './pipeline-contract'
import { runSiteDeploy } from './pipeline-deploy'
import { runImportPipeline } from './pipeline-import'
import { resolveRemoteLayout } from './remote-wordpress-layout'
import { buildSiteRunConfig } from './site-run-config'
import { createSiteSshSession } from './site-ssh-session'
import { getActiveThemeViaSsh, readRemoteDbCredentials } from './wp-config-reader'

export function createSiteRunJob(
  site: Site,
  environmentName: string,
  group: SiteRunGroup
): (context: SiteRunContext) => Promise<void> {
  return async (context) => {
    // Built inside the job so a secret rotated between queueing and starting is picked up, and so
    // a keychain prompt happens while the run is visibly in progress rather than before it starts.
    const config = await buildSiteRunConfig(site, environmentName, group)
    if (group === 'import') {
      await runImportPipeline(context, config)
      return
    }
    await runSiteDeploy(context, config, {
      createSiteSshSession,
      resolveRemoteLayout,
      readRemoteDbCredentials,
      getActiveThemeViaSsh
    })
  }
}
