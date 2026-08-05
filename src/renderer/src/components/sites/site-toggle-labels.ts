// Labels for the per-environment import/deploy step toggles.
//
// Separate from both components that render them: shared/site-types.ts owns the engine's data
// contract and must stay free of UI strings, and neither SiteEnvironmentSection (the site page) nor
// SiteSetupImportStage (the guided setup) owns the other's copy.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteToggleLabels = createLocalizedCatalog(
  (): Record<string, string> => ({
    exportDatabase: translate(
      'auto.components.sites.SiteEnvironmentSection.exportDatabase',
      'Pull/import server DB'
    ),
    exportFiles: translate(
      'auto.components.sites.SiteEnvironmentSection.exportFiles',
      'Pull server files'
    ),
    wpUploadRewrite: translate(
      'auto.components.sites.SiteEnvironmentSection.wpUploadRewrite',
      'WP upload rewrite'
    ),
    wpSearchReplace: translate(
      'auto.components.sites.SiteEnvironmentSection.wpSearchReplace',
      'WP search replace'
    ),
    gitPullOnServer: translate(
      'auto.components.sites.SiteEnvironmentSection.gitPullOnServer',
      'Git pull on server'
    ),
    clearServerCache: translate(
      'auto.components.sites.SiteEnvironmentSection.clearServerCache',
      'Clear server cache'
    ),
    deployThemes: translate(
      'auto.components.sites.SiteEnvironmentSection.deployThemes',
      'Deploy theme dist'
    )
  })
)
