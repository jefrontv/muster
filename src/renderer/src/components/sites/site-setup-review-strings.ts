// Copy for the Review screen of the redesigned setup dialog (SiteSetupReview, SiteSetupRow
// content, SiteSetupServePopover). Separate catalog from site-setup-strings, which is the paged
// SiteSetupContinuation this screen replaces — that component is still mounted from the old
// entry points until they are cut over, so its strings and this screen's must not collide.
//
// Every line here is written for a plan that has not run yet: "will clone", "Create", "Trust" —
// never a past-tense result verb (STYLEGUIDE "UI copy must not overclaim"). The one exception is
// the already-trusted certificate line, which reports `cert.trusted`, a real fact.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupReviewStrings = createLocalizedCatalog(() => ({
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
  serveNoStack: translate(
    'auto.components.sites.SiteSetupReview.serveNoStack',
    'No local stack is installed.'
  ),
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
  serveDomainLabel: translate('auto.components.sites.SiteSetupReview.serveDomainLabel', 'Domain'),
  serveAgentLocalNeedsWordPress: translate(
    'auto.components.sites.SiteSetupReview.serveAgentLocalNeedsWordPress',
    'Agent Local needs a WordPress install in the folder; this repo has none yet.'
  ),
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
  importNoEnvironment: translate(
    'auto.components.sites.SiteSetupReview.importNoEnvironment',
    'No environment is configured for this site yet.'
  ),
  importFrom: translate('auto.components.sites.SiteSetupReview.importFrom', 'From {{environment}}'),
  importAnyway: translate('auto.components.sites.SiteSetupReview.importAnyway', 'Import anyway')
}))
