// Copy for the post-bind guided setup. Separate catalog from site-bind-strings so the consent
// dialog's wording stays independent of the follow-on stages, and wrapped in
// createLocalizedCatalog for the same reason: a bare module-scope translate() would be captured at
// import time and never refresh after a language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupStrings = createLocalizedCatalog(() => ({
  title: translate('auto.components.sites.SiteSetupContinuation.title', 'Finish setting up'),
  description: translate(
    'auto.components.sites.SiteSetupContinuation.description',
    'The site is saved. These optional steps get it running locally.'
  ),
  loading: translate(
    'auto.components.sites.SiteSetupContinuation.loading',
    'Checking what this site needs…'
  ),
  stackHeading: translate(
    'auto.components.sites.SiteSetupContinuation.stackHeading',
    'Local WordPress'
  ),
  stackBody: translate(
    'auto.components.sites.SiteSetupContinuation.stackBody',
    'Register this folder with LocalWP so it can be served and given a database.'
  ),
  stackAction: translate(
    'auto.components.sites.SiteSetupContinuation.stackAction',
    'Set up LocalWP'
  ),
  stackPreviewing: translate(
    'auto.components.sites.SiteSetupContinuation.stackPreviewing',
    'Checking…'
  ),
  stackRunning: translate(
    'auto.components.sites.SiteSetupContinuation.stackRunning',
    'Setting up…'
  ),
  stackConfirm: translate('auto.components.sites.SiteSetupContinuation.stackConfirm', 'Run setup'),
  stackDone: translate(
    'auto.components.sites.SiteSetupContinuation.stackDone',
    'LocalWP site created'
  ),
  stackDomainLabel: translate(
    'auto.components.sites.SiteSetupContinuation.stackDomainLabel',
    'Local domain'
  ),
  certHeading: translate(
    'auto.components.sites.SiteSetupContinuation.certHeading',
    'HTTPS certificate'
  ),
  certAction: translate(
    'auto.components.sites.SiteSetupContinuation.certAction',
    'Trust certificate'
  ),
  certTrusting: translate('auto.components.sites.SiteSetupContinuation.certTrusting', 'Trusting…'),
  certTrusted: translate(
    'auto.components.sites.SiteSetupContinuation.certTrusted',
    'Trusted — the local site loads over https without a warning.'
  ),
  importHeading: translate(
    'auto.components.sites.SiteSetupContinuation.importHeading',
    'Import from the server'
  ),
  importBody: translate(
    'auto.components.sites.SiteSetupContinuation.importBody',
    'Pull the remote database and files down to this checkout.'
  ),
  importAction: translate(
    'auto.components.sites.SiteSetupContinuation.importAction',
    'Run import now'
  ),
  importStarting: translate(
    'auto.components.sites.SiteSetupContinuation.importStarting',
    'Starting…'
  ),
  importStarted: translate(
    'auto.components.sites.SiteSetupContinuation.importStarted',
    'Import started — progress is on the site page.'
  ),
  importSteps: translate(
    'auto.components.sites.SiteSetupContinuation.importSteps',
    '{{count}} steps enabled'
  ),
  overrideAction: translate(
    'auto.components.sites.SiteSetupContinuation.overrideAction',
    'Run anyway'
  ),
  skip: translate('auto.components.sites.SiteSetupContinuation.skip', 'Skip'),
  done: translate('auto.components.sites.SiteSetupContinuation.done', 'Done'),
  unavailable: translate('auto.components.sites.SiteSetupContinuation.unavailable', 'Not available')
}))
