// Copy for the Review screen of the setup dialog (SiteSetupReview, its rows, SiteSetupServeEditor).
//
// Every line here is written for a plan that has not run yet: "will clone", "Create", "Trust" —
// never a past-tense result verb (STYLEGUIDE "UI copy must not overclaim"). The one exception is
// the already-trusted certificate line, which reports `cert.trusted`, a real fact.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupReviewStrings = createLocalizedCatalog(() => ({
  serveEnable: translate(
    'auto.components.sites.SiteSetupReview.serveEnable',
    'Serve this site locally'
  ),
  serveOff: translate('auto.components.sites.SiteSetupReview.serveOff', 'Not served locally'),
  httpsEditLabel: translate('auto.components.sites.SiteSetupReview.httpsEditLabel', 'Change HTTPS'),
  httpsOff: translate('auto.components.sites.SiteSetupReview.httpsOff', 'No HTTPS'),
  importEditLabel: translate(
    'auto.components.sites.SiteSetupReview.importEditLabel',
    'Change import'
  ),
  importOff: translate('auto.components.sites.SiteSetupReview.importOff', 'Not importing'),
  importStepsSummary: translate(
    'auto.components.sites.SiteSetupReview.importStepsSummary',
    'From {{environment}} · {{count}} of {{total}} steps'
  ),
  cloneBranchFilter: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchFilter',
    'Find a branch'
  ),
  cloneBranchFromLink: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchFromLink',
    '{{environment}} link'
  ),
  cloneBranchDefaultBadge: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchDefaultBadge',
    'default'
  ),
  cloneBranchNoMatch: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchNoMatch',
    'No branches match'
  ),
  cloneBranchTitle: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchTitle',
    'Environment'
  ),
  cloneBranchEditLabel: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchEditLabel',
    'Change branch'
  ),
  cloneBranchLabel: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchLabel',
    'Branch to clone'
  ),
  cloneBranchSummary: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchSummary',
    '{{environment}} · will clone {{branch}}'
  ),
  cloneBranchDefault: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchDefault',
    'the default branch'
  ),
  cloneBranchLoading: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchLoading',
    'Loading branches…'
  ),
  cloneBranchListFailed: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchListFailed',
    "Couldn't list branches"
  ),
  cloneBranchExisting: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchExisting',
    'Uses the branch already checked out'
  ),
  cloneBranchMismatch: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchMismatch',
    'Not the {{environment}} branch'
  ),
  cloneBranchMismatchDetail: translate(
    'auto.components.sites.SiteSetupReview.cloneBranchMismatchDetail',
    'You chose to clone {{branch}}. Server details and imports still target {{environment}}, and deploys from this branch need confirming.'
  ),
  cloneTitle: translate('auto.components.sites.SiteSetupReview.cloneTitle', 'Clone'),
  serveTitle: translate('auto.components.sites.SiteSetupReview.serveTitle', 'Serve locally'),
  serveCreateLocalWp: translate(
    'auto.components.sites.SiteSetupReview.serveCreateLocalWp',
    'Create a LocalWP site at {{domain}}'
  ),
  serveAlreadyLocalWp: translate(
    'auto.components.sites.SiteSetupReview.serveAlreadyLocalWp',
    'Already a LocalWP site at {{domain}}'
  ),
  serveAgentLocal: translate(
    'auto.components.sites.SiteSetupReview.serveAgentLocal',
    'Serve with Agent Local at {{domain}}'
  ),
  serveDdev: translate(
    'auto.components.sites.SiteSetupReview.serveDdev',
    'Serve with DDEV on {{domain}}'
  ),
  serveNoStack: translate(
    'auto.components.sites.SiteSetupReview.serveNoStack',
    'No local stack is installed. Install one to serve this site.'
  ),
  installAgentLocal: translate(
    'auto.components.sites.SiteSetupReview.installAgentLocal',
    'Install Agent Local'
  ),
  installingAgentLocal: translate(
    'auto.components.sites.SiteSetupReview.installingAgentLocal',
    'Installing Agent Local…'
  ),
  getDdev: translate('auto.components.sites.SiteSetupReview.getDdev', 'Get DDEV'),
  getLocalWp: translate('auto.components.sites.SiteSetupReview.getLocalWp', 'Get LocalWP'),

  serveEditLabel: translate(
    'auto.components.sites.SiteSetupReview.serveEditLabel',
    'Change how this site is served'
  ),
  serveStackLabel: translate(
    'auto.components.sites.SiteSetupReview.serveStackLabel',
    'Local stack'
  ),
  serveStackLocalWp: translate(
    'auto.components.sites.SiteSetupReview.serveStackLocalWp',
    'LocalWP'
  ),
  serveStackAgentLocal: translate(
    'auto.components.sites.SiteSetupReview.serveStackAgentLocal',
    'Agent Local'
  ),
  serveStackDdev: translate('auto.components.sites.SiteSetupReview.serveStackDdev', 'DDEV'),
  serveDomainLabel: translate('auto.components.sites.SiteSetupReview.serveDomainLabel', 'Domain'),
  httpsTitle: translate('auto.components.sites.SiteSetupReview.httpsTitle', 'HTTPS'),
  httpsTrust: translate(
    'auto.components.sites.SiteSetupReview.httpsTrust',
    'Trust the certificate for {{domain}}'
  ),
  httpsAlreadyTrusted: translate(
    'auto.components.sites.SiteSetupReview.httpsAlreadyTrusted',
    'Certificate for {{domain}} is already trusted'
  ),
  importTitle: translate(
    'auto.components.sites.SiteSetupReview.importTitle',
    'Import from production'
  ),
  importAfterClone: translate(
    'auto.components.sites.SiteSetupReview.importAfterClone',
    'Add the server details after setup to pull the database and files.'
  ),
  importNoEnvironment: translate(
    'auto.components.sites.SiteSetupReview.importNoEnvironment',
    'No environment is configured for this site yet.'
  ),
  importFrom: translate('auto.components.sites.SiteSetupReview.importFrom', 'From {{environment}}')
}))
