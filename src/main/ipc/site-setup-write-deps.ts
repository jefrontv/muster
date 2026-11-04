// Wires agent setup writes to the same code the GUI's own channels run.

import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { detectSiteStack } from '../sites/local-stack-detection'
import { importOcsitesConfig } from '../sites/ocsites-config-import'
import { applyOcsitesImport } from '../sites/ocsites-import-apply'
import { linkSitesToRepos } from '../sites/site-repo-link'
import { consumeSiteSetupApproval } from '../sites/site-setup-approval-requests'
import type { SiteSetupWriteDeps } from '../sites/site-setup-writes'
import { handleSiteBindUrl } from './site-bind'
import { notifySiteChanged } from './site-change-notifier'
import { republishSiteRoots } from './site-roots'
import { redactMigrationStatus } from './site-stack-progress'
import { runSiteStackMigration } from './site-stack-migration-run'
import { sendToTrustedUIRenderer } from './ui'

export function createSiteSetupWriteDeps(
  store: Store,
  runtime: () => OrcaRuntimeService | null
): SiteSetupWriteDeps {
  return {
    store,
    runtime,
    consumeApproval: consumeSiteSetupApproval,
    onSiteChanged: notifySiteChanged,
    // The sidebar-sync event refetches sites and projects; the payload is not read.
    onSitesAdded: () =>
      sendToTrustedUIRenderer('sites:sidebarSynced', {
        eligible: 0,
        added: 0,
        linked: 0,
        skipped: [],
        adopted: 0
      }),
    republishSiteRoots,
    detectStack: detectSiteStack,
    runStackSetup: (args, log) =>
      runSiteStackMigration(
        store,
        args,
        (_siteId, secrets) => (message) => log(redactMigrationStatus(message, secrets))
      ),
    importOcsites: async () => {
      const applied = applyOcsitesImport(store, importOcsitesConfig())
      return { ...applied, repos: await linkSitesToRepos(store) }
    },
    stageBindLink: handleSiteBindUrl
  }
}
