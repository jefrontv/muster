// Copy the runner writes into step details. Result verbs only after the call returned - see
// STYLEGUIDE "UI copy must not overclaim".

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupRunnerStrings = createLocalizedCatalog(() => ({
  clonedInto: translate('auto.components.sites.SiteSetupRunner.clonedInto', 'Cloned into {{path}}'),
  registered: translate('auto.components.sites.SiteSetupRunner.registered', 'Site saved'),
  declined: translate('auto.components.sites.SiteSetupRunner.declined', 'Not selected'),
  httpsNeedsServe: translate(
    'auto.components.sites.SiteSetupRunner.httpsNeedsServe',
    'Needs a local stack to serve the site'
  ),
  importUnavailable: translate(
    'auto.components.sites.SiteSetupRunner.importUnavailable',
    'The import cannot run for this site yet'
  ),
  importMismatchDeclined: translate(
    'auto.components.sites.SiteSetupRunner.importMismatchDeclined',
    'The checked-out branch does not match the environment'
  ),
  localWp: translate('auto.components.sites.SiteSetupRunner.localWp', 'LocalWP'),
  agentLocal: translate('auto.components.sites.SiteSetupRunner.agentLocal', 'Agent Local'),
  alreadyServing: translate(
    'auto.components.sites.SiteSetupRunner.alreadyServing',
    'Already served by {{stack}} at {{domain}}'
  ),
  serving: translate(
    'auto.components.sites.SiteSetupRunner.serving',
    'Serving with {{stack}} at {{domain}}'
  ),
  trusted: translate(
    'auto.components.sites.SiteSetupRunner.trusted',
    'Certificate for {{domain}} trusted'
  ),
  certNotTrusted: translate(
    'auto.components.sites.SiteSetupRunner.certNotTrusted',
    'The certificate is still not trusted'
  ),
  imported: translate(
    'auto.components.sites.SiteSetupRunner.imported',
    'Imported from {{environment}}'
  ),
  importFailed: translate(
    'auto.components.sites.SiteSetupRunner.importFailed',
    'The import failed'
  ),
  cancelled: translate('auto.components.sites.SiteSetupRunner.cancelled', 'Cancelled')
}))
